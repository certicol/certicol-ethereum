pragma solidity 0.5.3;

import './ICerticolCA.sol';
import './ICerticolDAOToken.sol';

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';
import 'openzeppelin-solidity/contracts/token/ERC777/IERC777Recipient.sol';
import 'openzeppelin-solidity/contracts/introspection/IERC1820Registry.sol';

/**
 * @title Certicol DAO Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts defines the Certicol DAO as specified in the Certicol protocol.
 *
 * @dev This token contract obeys the ERC-1820 standard and uses Orcalize.
 */
contract CerticolDAO is IERC777Recipient {

    /// Use safe math
    using SafeMath for uint256;

    /// Struct definition
    struct CerticolDAOVoC {
        uint256 blockIssue;
        uint256 tokenStaked;
    }

    /// ERC-1820 registry
    IERC1820Registry private _erc1820 =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    /// ERC-777 interface hash for receiving tokens as a contract
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH =
        0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b; // keccak256("ERC777TokensRecipient")

    /// CDT token interface that includes the mintInterest function
    ICerticolDAOToken private _CDT;
    /// ERC-20 interface of the CDT token
    IERC20 private _CDT_ERC20;
    /// Ownable interface of the CDT token
    Ownable private _CDT_Ownable;
    /// CerticolCA interface
    ICerticolCA private _CA;

    /// Mapping from address to tokens locked
    mapping(address => uint256) private _tokensLocked;
    /// Mapping from address to their voting rights
    /// Voting rights is automatically granted once the DAO received the tokens,
    /// but can also be delegated to another address
    mapping(address => uint256) private _votingRights;
    /// Mapping from address to their available PoSaT credit
    /// Similar to voting rights, PoSaT credit is automatically granted
    /// PoSaT credit can be consumed by either participating the PoSaT mechanism,
    /// thus locking the credit, or by delegating them to another address
    mapping(address => uint256) private _availablePoSaT;
    /// Mapping from address to their locked PoSaT credit, due to participation
    /// in the PoSaT mechanism
    /// It should be noted that delegation would NOT increase _lockedPoSaT, and
    /// the query on the net PoSaT credits an address have (available + delegated)
    /// should be done by getAvailablePoSaT() + getNetDelegatedPoSaT()
    mapping(address => uint256) private _lockedPoSaT;
    /// Cumulative tokens locked
    uint256 private _cumulativeTokenLocked = 0;

    /// Mapping from address to each delegated address and the amount of voting rights delegated
    mapping(address => mapping(address => uint256)) private _delegatedVotingRights;
    /// Mapping from address to the NET delegated voting rights to avoid secondary delegation
    mapping(address => uint256) private _delegatedNetVotingRights;
    /// Mapping from address to each delegated address and the amount of PoSaT credits delegated
    mapping(address => mapping(address => uint256)) private _delegatedPoSaT;
    /// Mapping from address to the NET delegated PoSaT credits to avoid secondary delegation
    mapping(address => uint256) private _delegatedNetPoSaT;

    /// CDT token requirement for granting O10 authorization, designated to be 10% of initial token supply
    uint256 private _O10Requirement;
    /// Mapping from address to their O10 authorization status and the amount of tokens locked
    mapping(address => uint256) private _O10Authorization;
    /// CDT token requirement for O10 vote of confidence (10,000 CDT)
    uint256 private _vocRequirement = uint256(10000).mul(uint256(10**18));
    /// Mapping from O10 authorized address to total number of active PoSaT VoC records they have given out
    mapping(address => uint256) private _vocCount;
    /// Mapping from O10 authorized address to adress that they have voted confidence
    mapping(address => mapping(address => CerticolDAOVoC)) private _vocRecords;
    /// Reverse mappng from address being voted to an array of O10 authorized address that has voted confidence toward it
    mapping(address => address[]) private _vocReverseRecords;

    /// Proof-of-Stake-as-Trust reward ratio (5% p.a. as default)
    uint256 private _posatRewardRatio = 5;
    /// Proof-of-Stake-as-Trust reward block requirement (roughly 1 year as default)
    uint256 internal _posatRewardRequirement = 2102400;
    /// Cumulative PoSaT credits ratio required in O10 who have voted confidence to grant ring 1 status
    uint256 private _ringOneRequirement = 25;

    // Mapping that stored all used one-time seed used in previous O5 command to prevent reuse of those signatures
    mapping(uint256 => bool) private _usedOneTimeSeeds;
    /// Boolean that store whether this DAO is currently active
    bool private _DAODissolved = false;

    /// Event that will be emitted when tokens are received and locked within this contract
    event TokensLocked(address indexed tokenHolder, uint256 amount);
    /// Event that will be emitted when locked tokens are withdrawl
    event TokensUnlocked(address indexed tokenHolder, uint256 amount);

    /// Event that will be emitted upon delegation of voting rights
    event VotingRightsDelegation(address indexed tokenHolder, address indexed delegate, uint256 amount);
    /// Event that will be emitted upon the withdrawl of delegated voting rights
    event VotingRightsDelegationWithdrawl(address indexed tokenHolder, address indexed delegate, uint256 amount);
    /// Event that will be emitted upon delegation of free PoSaT credits
    event PoSaTDelegation(address indexed tokenHolder, address indexed delegate, uint256 amount);
    /// Event that will be emitted upon the withdrawl of delegated PoSaT credits
    event PoSaTDelegationWithdrawl(address indexed tokenHolder, address indexed delegate, uint256 amount);

    /// Event emitted when O10 authorization is given out
    event O10Authorized(address indexed O10, uint256 PoSaTLocked);
    /// Event emitted when O10 authotization is revoked
    event O10Deauthorized(address indexed O10, uint256 PoSaTUnlocked);
    /// Event emitted when O10 voted confidence
    event O10VotedConfidence(address indexed O10, address indexed target, uint256 PoSaTLocked);
    /// Event emitted when O10 was granted reward for PoSaT
    event O10RewardGranted(address indexed O10, uint256 reward);
    /// Event emitted when O10 revoke the vote of confidence
    event O10RevokeVoteConfidence(address indexed O10, address indexed target, uint256 PoSaTUnlocked);

    /// Event emitted when O5 is authorized
    event O5Authorized(string indexed functionSignatureIndex, string functionSignature, address[5] O5, uint256 cumulativeVote);
    /// Event emitted when O5 amends the cumulative PoSaT credits ratio required in O10 who have voted confidence to grant ring 1 status
    event O5AmendRingOneRequirement(uint256 effectiveFrom, uint256 amended);
    /// Event emitted when O5 amends the PoSaT reward requirement
    event O5AmendPoSaTRewardRequirement(uint256 effectiveFrom, uint256 amended);
    /// Event emitted when O5 amends the Proof-of-Stake-as-Trust reward ratio
    event O5AmendPoSaTReward(uint256 effectiveFrom, uint256 amended);
    /// Event emitted when O5 amends the CDT token requirement for O10 vote of confidence
    event O5AmendVoCRequirement(uint256 effectiveFrom, uint256 amended);
    /// Event emitted when O5 amends the CDT token requirement for granting O10 authorization
    event O5AmendO10Requirement(uint256 effectiveFrom, uint256 amended);
    /// Event emitted when O5 dissolve this DAO
    event O5DissolvedDAO(uint256 effectiveFrom);

    /**
     * @notice Initialize the CerticolDAO contract
     * @param tokenAddress address the address of the deployed CerticolDAOToken contract
     * @param caAddress address the address of the deployed CerticolCA contract
     */
    constructor(address tokenAddress, address caAddress) public {
        // Register ERC-777 RECIPIENT_INTERFACE at ERC-1820 registry
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
        // Initialize CDT token interface
        _CDT = ICerticolDAOToken(tokenAddress);
        _CDT_ERC20 = IERC20(tokenAddress);
        _CDT_Ownable = Ownable(tokenAddress);
        // Initialize O10 requirements
        _O10Requirement = _CDT_ERC20.totalSupply().div(10);
        // Initialize CerticolCA interface
        _CA = ICerticolCA(caAddress);
    }

    /**
     * @notice Get the number of tokens locked for holder
     * @param holder address the address queried
     * @return uint256 the number of tokens locked
     */
    function getTokensLocked(address holder) public view returns (uint256) {
        return _tokensLocked[holder];
    }

    /**
     * @notice Get the voting rights owned by holder
     * @param holder address the address queried
     * @return uint256 the number of voting rights owned
     */
    function getVotingRights(address holder) public view returns (uint256) {
        return _votingRights[holder];
    }

    /**
     * @notice Get the available PoSaT credit owned by holder
     * @param holder address the address queried
     * @return uint256 the available PoSaT credit owned
     */
    function getAvailablePoSaT(address holder) public view returns (uint256) {
        return _availablePoSaT[holder];
    }

    /**
     * @notice Get the locked PoSaT credit owned by holder
     * @param holder address the address queried
     * @return uint256 the locked PoSaT credit owned
     */
    function getLockedPoSaT(address holder) public view returns (uint256) {
        return _lockedPoSaT[holder];
    }

    /**
     * @notice Get the net amount of token locked in this contract
     * @return the net amount of token locked in this contract
     */
    function getCumulativeTokenLocked() public view returns (uint256) {
        return _cumulativeTokenLocked;
    }

    /**
     * @notice Get the amount of delegated voting rights from tokenHolder to delegate
     * @param tokenHolder address the address which has their tokens locked
     * @param delegate address the address of the delegate
     * @return uint256 the amount of delegated voting rights from tokenHolder to delegate
     */
    function getDelegatedVotingRights(address tokenHolder, address delegate) public view returns (uint256) {
        return _delegatedVotingRights[tokenHolder][delegate];
    }

    /**
     * @notice Get the net amount of delegated voting rights from tokenHolder to all delegate(s)
     * @param tokenHolder address the address which has their tokens locked
     * @return uint256 the net amount of delegated voting rights from tokenHolder to all delegate(s)
     */
    function getNetDelegatedVotingRights(address tokenHolder) public view returns (uint256) {
        return _delegatedNetVotingRights[tokenHolder];
    }

    /**
     * @notice Get the amount of delegated PoSaT credits from tokenHolder to delegate
     * @param tokenHolder address the address which has their tokens locked
     * @param delegate address the address of the delegate
     * @return uint256 tthe amount of delegated PoSaT credits from tokenHolder to delegate
     */
    function getDelegatedPoSaT(address tokenHolder, address delegate) public view returns (uint256) {
        return _delegatedPoSaT[tokenHolder][delegate];
    }

    /**
     * @notice Get the net amount of delegated PoSaT credits from tokenHolder to all delegate(s)
     * @param tokenHolder address the address which has their tokens locked
     * @return uint256 the net amount of delegated PoSaT credits from tokenHolder to all delegate(s)
     */
    function getNetDelegatedPoSaT(address tokenHolder) public view returns (uint256) {
        return _delegatedNetPoSaT[tokenHolder];
    }

    /**
     * @notice Get the amount of available PoSaT credits required for O10 authorization
     * @return uint256 the amount of available PoSaT credits required for O10 authorization
     */
    function getO10Requirements() public view returns (uint256) {
        return _O10Requirement;
    }

    /**
     * @notice Get the O10 authorization status of an address
     * @param query address the address to be queried
     * @return bool true if query owns O10 authorization status and false if doesn't
     */
    function getO10Status(address query) public view returns (bool) {
        return _O10Authorization[query] != 0;
    }

    /**
     * @notice Get the available PoSaT credits requirement for voting confidence
     * @return bool the available PoSaT credits requirement for voting confidence
     */
    function getVOCRequirement() public view returns (uint256) {
        return _vocRequirement;
    }

    /**
     * @notice Get the total number of active PoSaT vote of confidence issued by the O10 member
     * @param O10 address the address of the O10 to be queried
     * @return uint256 the total number of active PoSaT vote of confidence issued by the O10 member
     */
    function getActiveVoCIssued(address O10) public view returns (uint256) {
        return _vocCount[O10];
    }

    /**
     * @notice Get a list of O10 that has voted confidence toward target
     * @param target address the address to be queried on what O10 has voted confidence on it
     * @return address[] list of O10 that has voted confidence toward target
     * @dev address(0) could be returned in the array, which is an leftover from a revoke of vote of confidence
     */
    function getVoC(address target) public view returns (address[] memory) {
        return _vocReverseRecords[target];
    }

    /**
     * @notice Get whether a O10 has voted confidence toward target
     * @param target address the address to be queried on whether O10 has voted confidence on it
     * @param O10 address the address of the O10 to be queried
     * @return bool true if O10 has voted confidence, and false if otherwise
     */
    function getVoCFrom(address target, address O10) public view returns (bool) {
        return _vocRecords[O10][target].blockIssue != 0;
    }

    /**
     * @notice Get the current Proof-of-Stake-as-Trust reward ratio
     * @return uint256 the current Proof-of-Stake-as-Trust reward ratio
     */
    function getCurrentPoSaTReward() public view returns (uint256) {
        return _posatRewardRatio;
    }

    /**
     * @notice Get the current Proof-of-Stake-as-Trust reward block requirement
     * @return uint256 the current Proof-of-Stake-as-Trust reward block requirement
     */
    function getCurrentPoSaTRequirement() public view returns (uint256) {
        return _posatRewardRequirement;
    }

    /**
     * @notice Get the current cumulative PoSaT credits ratio required in O10 who have voted confidence to grant ring 1 status
     * @return uint256 the current cumulative PoSaT credits ratio required in O10 who have voted confidence to grant ring 1 status
     */
    function getCurrentRingOneRequirement() public view returns (uint256) {
        return _ringOneRequirement;
    }

    /**
     * @notice Get the current ring of validation for target
     * @param target address the address to be queried
     * @return uint256 either 1, 2, 3 or 4 which corresponds to the ring of validation
     * @dev Ring one validation is granted if target owns a valid ring 2 status
     * @dev And, in addition, cumulative PoSaT credits owned by O10 who have voted confidence > _ringOneRequirement of total supply
     */
    function getCurrentRing(address target) external view returns (uint256) {
        // Get ring 2 - 4 validation status from CerticolCA
        (uint256 ring,,) = _CA.getStatus(target);
        // Return ring 3 - 4 validation status since no further computation is required
        if (ring > 2) {
            return ring;
        }
        // Compute if target qualifies for ring 1 validation
        // Calculate the total PoSaT credits held by O10 who have voted confidence (inc. available and locked credits)
        uint256 totalTokenHeld = 0;
        for (uint256 i = 0; i<_vocReverseRecords[target].length; i++) {
            address currentO10 = _vocReverseRecords[target][i];
            // Skip if current address is address(0) - leftover from revoking vote of confidence
            if (currentO10 != address(0)) {
                totalTokenHeld = totalTokenHeld.add(_availablePoSaT[currentO10]).add(_lockedPoSaT[currentO10]);
            }
        }
        // Validate if all O10 that has voted confidence toward target have a summation of 25% tokens locked
        if (totalTokenHeld.mul(100).div(_ringOneRequirement) >= _cumulativeTokenLocked) {
            return 1; // Ring 1 status
        }
        else {
            return 2; // Ring 2 status
        }
    }

    /**
     * @notice Get if the given seed was already used in a previous O5 command
     * @return bool true if the seed was used before, or false if otherwise
     */
    function getSeedUsed(uint256 seed) external view returns (bool) {
        return _usedOneTimeSeeds[seed];
    }

    /**
     * @notice Get if the current DAO has been dissolved
     * @return bool true if the current DAO has been dissolved, or false if otherwise
     */
    function getDAODissolved() external view returns (bool) {
        return _DAODissolved;
    }

    /**
     * @notice Throws if O5 has dissolved this DAO
     */
    modifier DAOFunctional() {
        // Require dissolved flag to be false
        require(!_DAODissolved, "CerticolDAO: this function is no longer available since O5 has dissolved this DAO");
        _;
    }

    /**
     * @notice Implements the IERC777Recipient interface to allow this contract to receive CDT token
     * @dev Any inward transaction of ERC-777 other than CDT token would be reverted
     * @param from address token holder address
     * @param amount uint256 amount of tokens to transfer
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function tokensReceived(address, address from, address, uint256 amount, bytes calldata, bytes calldata) external DAOFunctional {
        // Only accept inward ERC-777 transaction if it is the CDT token
        require(msg.sender == address(_CDT), "CerticolDAO: we only accept CDT token");
        // Modify the internal state upon receiving the tokens
        _tokensLocked[from] = _tokensLocked[from].add(amount);
        _votingRights[from] = _votingRights[from].add(amount);
        _availablePoSaT[from] = _availablePoSaT[from].add(amount);
        _cumulativeTokenLocked = _cumulativeTokenLocked.add(amount);
        // Emit TokensLocked event
        emit TokensLocked(from, amount);
    }

    /**
     * @notice Allow msg.sender to withdraw locked token
     * @dev This function will only proceeds if the msg.sender owns 1 voting rights and 1 free PoSaT credit per 1 token withdrawl,
     * and would otherwise reverts
     * @param amount uint256 amount of tokens to withdraw
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function withdrawToken(uint256 amount) external DAOFunctional {
        // Subtract amount from _votingRights and _availablePoSaT
        _votingRights[msg.sender] = _votingRights[msg.sender].sub(amount);
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].sub(amount);
        // Successfully subtracted their voting rights and PoSaT credit
        // Proceed with the withdrawl
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(amount);
        _cumulativeTokenLocked = _cumulativeTokenLocked.sub(amount);
        // Emit TokensUnlocked event
        emit TokensUnlocked(msg.sender, amount);
        // Transfer token to msg.sender
        _CDT_ERC20.transfer(msg.sender, amount);
    }

    /**
     * @notice Delegate voting rights from msg.sender to a specific delegate
     * @dev This function will only proceeds if the msg.sender owns sufficient voting rights,
     * and if total voting rights delegated after operation would not exceeds the amount of tokens locked
     * to avoid secondary delegation
     * @param delegate address address of the delegate
     * @param amount uint256 amount of voting rights to delegate
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function delegateVotingRights(address delegate, uint256 amount) external DAOFunctional {
        // Check if total voting rights delegated after operation would exceeds the amount of tokens
        require(
            _delegatedNetVotingRights[msg.sender].add(amount) <= _tokensLocked[msg.sender],
            "CerticolDAO: insufficient voting rights or secondary delegation is not permitted"
        );
        // Transfer voting rights to delegate
        _votingRights[msg.sender] = _votingRights[msg.sender].sub(amount);
        _votingRights[delegate] = _votingRights[delegate].add(amount);
        // Add the delegate record to _delegatedVotingRights and _delegatedNetVotingRights
        _delegatedVotingRights[msg.sender][delegate] = _delegatedVotingRights[msg.sender][delegate].add(amount);
        _delegatedNetVotingRights[msg.sender] = _delegatedNetVotingRights[msg.sender].add(amount);
        // Emit VotingRightsDelegation
        emit VotingRightsDelegation(msg.sender, delegate, amount);
    }

    /**
     * @notice Withdraw delegated voting rights from a specific delegate
     * @dev This function will reverts if amount > voting rights delegated to the delegate
     * @param delegate address address of the delegate
     * @param amount uint256 amount of delegated voting rights to withdraw from the delegate
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function withdrawDelegatedVotingRights(address delegate, uint256 amount) external DAOFunctional {
        // Reduce the amount from _delegatedVotingRights and _delegatedNetVotingRights
        // This will also revert if amount exceeds the voting rights initially delegated
        _delegatedVotingRights[msg.sender][delegate] = _delegatedVotingRights[msg.sender][delegate].sub(amount);
        _delegatedNetVotingRights[msg.sender] = _delegatedNetVotingRights[msg.sender].sub(amount);
        // Transfer voting rights back to msg.sender
        _votingRights[delegate] = _votingRights[delegate].sub(amount);
        _votingRights[msg.sender] = _votingRights[msg.sender].add(amount);
        // Emit VotingRightsDelegationWithdrawl
        emit VotingRightsDelegationWithdrawl(msg.sender, delegate, amount);
    }

    /**
     * @notice Delegate PoSaT credits from msg.sender to a specific delegate
     * @dev This function will only proceeds if the msg.sender owns sufficient FREE PoSaT credits,
     * and if total voting rights delegated after operation would not exceeds the amount of tokens locked
     * to avoid secondary delegation
     * @param delegate address address of the delegate
     * @param amount uint256 amount of voting rights to delegate
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function delegatePoSaT(address delegate, uint256 amount) external DAOFunctional {
        // Check if total PoSaT delegated after operation would exceeds the amount of tokens
        require(
            _delegatedNetPoSaT[msg.sender].add(amount) <= _tokensLocked[msg.sender],
            "CerticolDAO: insufficient PoSaT credits or secondary delegation is not permitted"
        );
        // Transfer free PoSaT credits to delegate
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].sub(amount);
        _availablePoSaT[delegate] = _availablePoSaT[delegate].add(amount);
        // Add the delegate record to _delegatedPoSaT and _delegatedNetPoSaT
        _delegatedPoSaT[msg.sender][delegate] = _delegatedPoSaT[msg.sender][delegate].add(amount);
        _delegatedNetPoSaT[msg.sender] = _delegatedNetPoSaT[msg.sender].add(amount);
        // Emit PoSaTDelegation
        emit PoSaTDelegation(msg.sender, delegate, amount);
    }

    /**
     * @notice Withdraw delegated PoSaT credits from a specific delegate
     * @dev This function will reverts if amount > PoSaT credits delegated to the delegate,
     * or if the delegate does not have the required FREE PoSaT credits
     * @param delegate address address of the delegate
     * @param amount uint256 amount of delegated voting rights to withdraw from the delegate
     * @dev Reverts if O5 has dissolved the current DAO
     */
    function withdrawDelegatedPoSaT(address delegate, uint256 amount) external DAOFunctional {
        // Reduce the amount from _delegatedPoSaT and _delegatedNetPoSaT
        // This will also revert if amount exceeds the PoSaT credits initially delegated
        _delegatedPoSaT[msg.sender][delegate] = _delegatedPoSaT[msg.sender][delegate].sub(amount);
        _delegatedNetPoSaT[msg.sender] = _delegatedNetPoSaT[msg.sender].sub(amount);
        // Transfer PoSaT credits back to msg.sender
        // Unlike voting rights, PoSaT credits can be locked by the delegate by participating in the PoSaT mechanism
        // The withdrawl of delegated PoSaT credits will only work if the delegate has sufficient free PoSaT credits
        _availablePoSaT[delegate] = _availablePoSaT[delegate].sub(amount);
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].add(amount);
        // Emit PoSaTDelegationWithdrawl
        emit PoSaTDelegationWithdrawl(msg.sender, delegate, amount);
    }

    /**
     * @notice Throws if msg.sender do not have O10 authorization
     */
    modifier O10Only() {
        require(getO10Status(msg.sender), "CerticolDAO: msg.sender did not owned a valid O10 authorization");
        _;
    }

    /**
     * @notice Lock _O10Requirement PoSaT credits and grants msg.sender O10 authorization
     * @dev Reverts if O5 has dissolved the current DAO
     * @dev Reverts if msg.sender does not have sufficient available PoSaT credits
     * @dev Reverts if msg.sender have O10 authorization already
     */
    function O10Authorization() external DAOFunctional {
        // Check if msg.sender already have O10 authorization
        require(!getO10Status(msg.sender), "CerticolDAO: msg.sender already owned a valid O10 authorization");
        // Lock _O10Requirement PoSaT credits
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].sub(_O10Requirement);
        _lockedPoSaT[msg.sender] = _lockedPoSaT[msg.sender].add(_O10Requirement);
        // Grant O10 authorization
        _O10Authorization[msg.sender] = _O10Requirement;
        // Emit O10Authorized
        emit O10Authorized(msg.sender, _O10Requirement);
    }

    /**
     * @notice Revoke msg.sender O10 authorization and unlock locked PoSaT credits
     * @dev Reverts if O5 has dissolved the current DAO
     * @dev Reverts if msg.sender do not have O10 authorization already
     * @dev Reverts if msg.sender still have active PoSaT VoC issued currently
     * @dev O10 can ONLY be deauthorized after all PoSaT VoC issued by msg.sender has been revoked
     */
    function O10Deauthorization() external DAOFunctional O10Only {
        // Check if msg.sender still has any active PoSaT VoC
        require(getActiveVoCIssued(msg.sender) == 0, "CerticolDAO: msg.sender still has active PoSaT VoC");
        // Unlock _O10Requirement PoSaT credits
        uint256 lockedCredit = _O10Authorization[msg.sender];
        _lockedPoSaT[msg.sender] = _lockedPoSaT[msg.sender].sub(lockedCredit);
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].add(lockedCredit);
        // Revoke O10 authorization
        _O10Authorization[msg.sender] = 0;
        // Emit O10Deauthorized
        emit O10Deauthorized(msg.sender, lockedCredit);
    }

    /**
     * @notice Lock required amounts of PoSaT credits and vote confidence toward target
     * @param target address the address to be voted confidence on
     * @dev Reverts if O5 has dissolved the current DAO
     * @dev Reverts if msg.sender do not have O10 authorization already
     * @dev Reverts if msg.sender have already voted confidence toward target
     * @dev Reverts if msg.sender do not have sufficient available PoSaT credits
     */
    function O10VoteConfidence(address target) external DAOFunctional O10Only {
        // Check if msg.sender has already voted confidence toward target
        require(!getVoCFrom(target, msg.sender), "CerticolDAO: msg.sender has already voted confidence toward target");
        // Subtract required PoSaT credits from msg.sender
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].sub(_vocRequirement);
        _lockedPoSaT[msg.sender] = _lockedPoSaT[msg.sender].add(_vocRequirement);
        // Adds to active PoSaT VoC
        _vocCount[msg.sender] = _vocCount[msg.sender].add(1);
        // Appends the record to VoC records
        _vocRecords[msg.sender][target] = CerticolDAOVoC(block.number, _vocRequirement);
        // Appends to reverse records as well
        _vocReverseRecords[target].push(msg.sender);
        // Emit O10VotedConfidence
        emit O10VotedConfidence(msg.sender, target, _vocRequirement);
    }

    /**
     * @notice Get PoSaT reward from a vote of confidence issued to target
     * @param target address the address that msg.sender have voted confidence on, and would like to get the PoSaT reward from the vote
     * @dev Reverts if O5 has dissolved the current DAO
     * @dev Reverts if msg.sender do not have O10 authorization already
     * @dev Reverts if msg.sender have not voted confidence toward target
     * @dev Reverts if the vote has not been sustained for a minimum of _posatRewardRequirement blocks
     * @dev Reverts if the target has not sustained ring 2 status from CerticolCA for a minimum of _posatRewardRequirement blocks
     */
    function O10GetReward(address target) external DAOFunctional O10Only {
        // Check if msg.sender has actually voted confidence toward target
        require(getVoCFrom(target, msg.sender), "CerticolDAO: msg.sender has not voted confidence toward target");
        // Check if the vote has sustained for _posatRewardRequirement blocks
        require(
            block.number.sub(_vocRecords[msg.sender][target].blockIssue) >= _posatRewardRequirement,
            "CerticolDAO: vote of confidence has not sustained long enough for reward"
        );
        // Check if the Ring 2 validation has sustained throughout this period
        (,uint256 ring2IssueBlock,) = _CA.getStatus(target);
        require(ring2IssueBlock != 0, "CerticolDAO: target has no ring 2 status");
        require(
            block.number.sub(ring2IssueBlock) >= _posatRewardRequirement,
            "CerticolDAO: ring 2 status has not sustained long enough for reward"
        );
        // Calculate the reward to be minted (tokenStaked * _posatRewardRatio / 100)
        uint256 reward = _vocRecords[msg.sender][target].tokenStaked.mul(_posatRewardRatio).div(100);
        // Before reward is minted, increment blockIssue in CerticolDAOVoC record
        _vocRecords[msg.sender][target].blockIssue = _vocRecords[msg.sender][target].blockIssue.add(_posatRewardRequirement);
        // Emit O10RewardGranted
        emit O10RewardGranted(msg.sender, reward);
        // Mint the reward
        _CDT.mintInterest(msg.sender, reward);
    }

    /**
     * @notice Revoke vote of confidence and unlock the locked PoSaT credits
     * @param target address the address that msg.sender have voted confidence on, and would like to revoke the vote
     * @dev Reverts if O5 has dissolved the current DAO
     * @dev Reverts if msg.sender do not have O10 authorization already
     * @dev Reverts if msg.sender have not voted confidence toward target
     */
    function O10RevokeVote(address target) external DAOFunctional O10Only {
        // Check if msg.sender has actually voted confidence toward target
        require(getVoCFrom(target, msg.sender), "CerticolDAO: msg.sender has not voted confidence toward target");
        // Delete reverse vote entry in _vocReverseRecords
        for (uint256 i = 0; i<_vocReverseRecords[target].length; i++) {
            if (_vocReverseRecords[target][i] == msg.sender) {
                delete _vocReverseRecords[target][i];
                break;
            }
        }
        // Delete vote entry in _vocRecords
        uint256 tokenLocked = _vocRecords[msg.sender][target].tokenStaked;
        delete _vocRecords[msg.sender][target];
        // Subtract 1 from active PoSaT VoC
        _vocCount[msg.sender] = _vocCount[msg.sender].sub(1);
        // Unlock the locked PoSaT credits
        _lockedPoSaT[msg.sender] = _lockedPoSaT[msg.sender].sub(tokenLocked);
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].add(tokenLocked);
        // Emit O10RevokeVoteConfidence
        emit O10RevokeVoteConfidence(msg.sender, target, tokenLocked);
    }

    /**
     * @notice O5 authorization check
     * @param fnSignature string the function signature
     * @param amendedValue uint256 the new PoSaT reward requirement
     * @param effectiveBlock uint256 the block number signed by O5 members in signature
     * @param oneTimeSeed uint256 an one-time seed used to prevent reuse of published signatures
     * @param v uint[5] v component of up to 5 signatures
     * @param r bytes32[5] r component of up to 5 signatures
     * @param s bytes32[5] s component of up to 5 signatures
     * @dev Reverts if effectiveBlock > block.number, which indicate the signature has already expired
     * @dev Reverts if cumulative voting rights in all signatures did not exceeds 50% of all voting rights
     */
    modifier O5Only(
        string memory fnSignature, uint256 amendedValue, uint256 effectiveBlock,
        uint256 oneTimeSeed, uint8[5] memory v, bytes32[5] memory r, bytes32[5] memory s
    ) {
        // Check if signature would still be valid (i.e. effectiveBlock > block.number)
        require(effectiveBlock > block.number, "CerticolDAO: signature has expired");
        // Check if oneTimeSeed was used in the past
        require(!_usedOneTimeSeeds[oneTimeSeed], "CerticolDAO: the seed was already used");
        // Ethereum signature prefix
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        // Expected message to be signed would be sha3(fnSignature, amendedValue, effectiveBlock, oneTimeSeed)
        bytes32 expectedMessage = keccak256(abi.encodePacked(fnSignature, amendedValue, effectiveBlock, oneTimeSeed));
        // Expected actual hash signed to be sha3(prefix, message)
        bytes32 expectedHash = keccak256(abi.encodePacked(prefix, expectedMessage));
        // List of O5s that have voted this authorization
        address[5] memory O5s;
        // Cumulative voting rights that has signed the message
        uint256 netVotingRights = 0;
        // Loop through v, r, s arrays to recover signing address and sum their voting right
        for (uint256 i = 0; i<5; i++) {
            // Extract address of the voter
            address O5 = ecrecover(expectedHash, v[i], r[i], s[i]);
            // Process only if O5 is not address(0)
            if (O5 != address(0)) {
                // Record to the list of O5s
                O5s[i] = O5;
                // Adds to cumulative voting rights
                netVotingRights = netVotingRights.add(_votingRights[O5]);
            }
        }
        // Check if cumulative voting rights exceeds 50% of total voting rights
        require(
            netVotingRights >= _cumulativeTokenLocked.div(2),
            "CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights"
        );
        // Updated used seed mapping
        _usedOneTimeSeeds[oneTimeSeed] = true;
        // Emit O5Authorized
        emit O5Authorized(fnSignature, fnSignature, O5s, netVotingRights);
        // Proceed if true
        _;
    }

    /**
     * @notice O5 command to modify CerticolDAO variables
     * @param effectiveBlock uint256 the block number signed by O5 members in signature
     * @param oneTimeSeed uint256 an one-time seed used to prevent reuse of published signatures
     * @param v uint[5] v component of up to 5 signatures
     * @param r bytes32[5] r component of up to 5 signatures
     * @param s bytes32[5] s component of up to 5 signatures
     * @param fnSignature string command string that correspond to the variable to be modified
     * @param amendedValue uint256 the new ring one requirement
     * @dev Reverts if O5 check failed
     */
    function O5Modify(
        uint256 effectiveBlock, uint256 oneTimeSeed,
        uint8[5] calldata v, bytes32[5] calldata r, bytes32[5] calldata s,
        string calldata fnSignature, uint256 amendedValue
    ) external O5Only(fnSignature, amendedValue, effectiveBlock, oneTimeSeed, v, r, s) {
        bytes32 fnSignatureHash = keccak256(abi.encodePacked(fnSignature));
        if (fnSignatureHash == keccak256(abi.encodePacked("O5ModifyRingOneRequirement"))) {
            // Change the ring one requirement
            _ringOneRequirement = amendedValue;
            // Emit O5AmendRingOneRequirement
            emit O5AmendRingOneRequirement(block.number, amendedValue);
        }
        else if (fnSignatureHash == keccak256(abi.encodePacked("O5ModifyPoSaTRequirement"))) {
            // Change the reward requirement
            _posatRewardRequirement = amendedValue;
            // Emit O5AmendPoSaTRewardRequirement
            emit O5AmendPoSaTRewardRequirement(block.number, amendedValue);
        }
        else if (fnSignatureHash == keccak256(abi.encodePacked("O5ModifyPoSaTReward"))) {
            // Change the PoSaT reward ratio
            _posatRewardRatio = amendedValue;
            // Emit O5AmendPoSaTReward
            emit O5AmendPoSaTReward(block.number, amendedValue);
        }
        else if (fnSignatureHash == keccak256(abi.encodePacked("O5ModifyVoCRequirement"))) {
            // Change the VoC Requirement
            _vocRequirement = amendedValue;
            // Emit O5AmendVoCRequirement
            emit O5AmendVoCRequirement(block.number, amendedValue);
        }
        else if (fnSignatureHash == keccak256(abi.encodePacked("O5ModifyO10Requirement"))) {
            // Change the O10 Requirement
            _O10Requirement = amendedValue;
            // Emit O5AmendO10Requirement
            emit O5AmendO10Requirement(block.number, amendedValue);
        }
        else {
            return;
        }
    }

    /**
     * @notice O5 command to dissolve CerticolDAO
     * @param effectiveBlock uint256 the block number signed by O5 members in signature
     * @param oneTimeSeed uint256 an one-time seed used to prevent reuse of published signatures
     * @param v uint[5] v component of up to 5 signatures
     * @param r bytes32[5] r component of up to 5 signatures
     * @param s bytes32[5] s component of up to 5 signatures
     * @dev Reverts if O5 check failed
     * @dev Upon dissolving of CerticolDAO, the ownership of CerticolDAOToken would be transferred to msg.sender
     * @dev All standard DAO function will also revert after this operation
     * @dev An additional withdrawl function that allows all locked token to be withdrawl will also be opened
     */
    function O5DissolveDAO(
        uint256 effectiveBlock, uint256 oneTimeSeed,
        uint8[5] calldata v, bytes32[5] calldata r, bytes32[5] calldata s
    ) external O5Only("O5DissolveDAO", 0, effectiveBlock, oneTimeSeed, v, r, s) {
        // Set dissolved falg
        _DAODissolved = true;
        // Transfer ownership of CerticolDAOToken
        _CDT_Ownable.transferOwnership(msg.sender);
        // Emit O5DissolvedDAO
        emit O5DissolvedDAO(block.number);
    }

    /**
     * @notice Allow the withdrawl of all token locked in this contract after O5 has dissolved this DAO
     * @dev Reverts if this DAO has not been dissolved
     */
    function dissolveWithdrawl() external {
        // Require dissolved flag
        require(_DAODissolved, "CerticolDAO: this function is only available if O5 has dissolved this DAO");
        // Get total amount of token locked by msg.sender
        uint256 tokenLocked = _tokensLocked[msg.sender];
        // Reset tokensLocked mapping
        _tokensLocked[msg.sender] = 0;
        // Reduce cumulative token locked respectively
        _cumulativeTokenLocked = _cumulativeTokenLocked.sub(tokenLocked);
        // Emit TokensUnlocked
        emit TokensUnlocked(msg.sender, tokenLocked);
        // Withdraw all token locked
        _CDT_ERC20.transfer(msg.sender, tokenLocked);
    }

}