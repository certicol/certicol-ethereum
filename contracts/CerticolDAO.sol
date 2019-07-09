pragma solidity 0.5.3;

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';
import 'openzeppelin-solidity/contracts/token/ERC777/IERC777Recipient.sol';
import 'openzeppelin-solidity/contracts/introspection/IERC1820Registry.sol';
import './ICerticolDAOToken.sol';

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

    /// ERC-1820 registry
    IERC1820Registry private _erc1820 =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    /// ERC-777 interface hash for receiving tokens as a contract
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH =
        0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b; // keccak256("ERC777TokensRecipient")

    /// CTD token interface that includes the mintInterest function
    ICerticolDAOToken private _CTD;
    /// ERC-20 interface of the CTD token
    IERC20 private _CTD_ERC20;

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
    mapping(address => uint256) private _lockedPoSaT;

    /// Mapping from address to each delegated address and the amount of voting rights delegated
    mapping(address => mapping(address => uint256)) private _delegatedVotingRights;
    /// Mapping from address to the NET delegated voting rights to avoid secondary delegation
    mapping(address => uint256) private _delegatedNetVotingRights;
    /// Mapping from address to each delegated address and the amount of PoSaT credits delegated
    mapping(address => mapping(address => uint256)) private _delegatedPoSaT;
    /// Mapping from address to the NET delegated PoSaT credits to avoid secondary delegation
    mapping(address => uint256) private _delegatedNetPoSaT;

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

    /**
     * @notice Initialize the CerticolDAO contract
     */
    constructor(address tokenAddress) public {
        // Register ERC-777 RECIPIENT_INTERFACE at ERC-1820 registry
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
        // Initialize CTD token interface
        _CTD = ICerticolDAOToken(tokenAddress);
        _CTD_ERC20 = IERC20(tokenAddress);
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
     * @notice Implements the IERC777Recipient interface to allow this contract to receive CTD token
     * @dev Any inward transaction of ERC-777 other than CTD token would be reverted
     * @param from address token holder address
     * @param amount uint256 amount of tokens to transfer
     */
    function tokensReceived(address, address from, address, uint256 amount, bytes calldata, bytes calldata) external {
        // Only accept inward ERC-777 transaction if it is the CTD token
        require(msg.sender == address(_CTD), "CDAO: we only accept CTD token");
        // Modify the internal state upon receiving the tokens
        _tokensLocked[from] = _tokensLocked[from].add(amount);
        _votingRights[from] = _votingRights[from].add(amount);
        _availablePoSaT[from] = _availablePoSaT[from].add(amount);
        // Emit TokensLocked event
        emit TokensLocked(from, amount);
    }

    /**
     * @notice Allow msg.sender to withdraw locked token
     * @dev This function will only proceeds if the msg.sender owns 1 voting rights and 1 free PoSaT credit per 1 token withdrawl,
     * and would otherwise reverts
     * @param amount uint256 amount of tokens to withdraw
     */
    function withdrawToken(uint256 amount) external {
        // Subtract amount from _votingRights and _availablePoSaT
        _votingRights[msg.sender] = _votingRights[msg.sender].sub(amount);
        _availablePoSaT[msg.sender] = _availablePoSaT[msg.sender].sub(amount);
        // Successfully subtracted their voting rights and PoSaT credit
        // Proceed with the withdrawl
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(amount);
        // Emit TokensUnlocked event
        emit TokensUnlocked(msg.sender, amount);
        // Transfer token to msg.sender
        _CTD_ERC20.transfer(msg.sender, amount);
    }

    /**
     * @notice Delegate voting rights from msg.sender to a specific delegate
     * @dev This function will only proceeds if the msg.sender owns sufficient voting rights,
     * and if total voting rights delegated after operation would not exceeds the amount of tokens locked
     * to avoid secondary delegation
     * @param delegate address address of the delegate
     * @param amount uint256 amount of voting rights to delegate
     */
    function delegateVotingRights(address delegate, uint256 amount) external {
        // Check if total voting rights delegated after operation would exceeds the amount of tokens
        require(
            _delegatedNetVotingRights[msg.sender].add(amount) <= _tokensLocked[msg.sender],
            "CDAO: insufficient voting rights or secondary delegation is not permitted"
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
     */
    function withdrawDelegatedVotingRights(address delegate, uint256 amount) external {
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
     */
    function delegatePoSaT(address delegate, uint256 amount) external {
        // Check if total PoSaT delegated after operation would exceeds the amount of tokens
        require(
            _delegatedNetPoSaT[msg.sender].add(amount) <= _tokensLocked[msg.sender],
            "CDAO: insufficient PoSaT credits or secondary delegation is not permitted"
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
     */
    function withdrawDelegatedPoSaT(address delegate, uint256 amount) external {
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

}