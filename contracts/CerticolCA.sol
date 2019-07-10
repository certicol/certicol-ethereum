pragma solidity 0.5.3;

import 'provable-domain/contracts/HTTPChallenge.sol';
import './ICerticolCA.sol';

/**
 * @title Certicol Certification Authority (CA) Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts defines the Certicol certificate authority as specified in the Certicol protocol.
 */
contract CerticolCA is HTTPChallenge(105276), ICerticolCA {

    /// Mapping from certificate issuer address to ring 3 validation status
    mapping(address => bool) private ringThree;
    /// Mapping from certificate issuer address to webpage declared for ring 2 validation
    mapping(address => string) private ringTwoDeclaredWebsite;
    /// Mapping from certificate issuer address to the block of issue of ring 2 validation
    mapping(address => uint256) private ringTwoIssue;
    /// Mapping from certificate issuer address to the block of expiration for ring 2 validation
    mapping(address => uint256) private ringTwoExpire;

    /// Mapping from challengeId to the address of the claimed owner
    mapping(uint256 => address) private challengeMap;

    /// Number of block time granted per successful ring 2 validation
    uint256 constant RING_TWO_VALIDITY_PERIOD = 1051200;

    /// Event emitted upon ring 3 declaration
    event RingThreeDeclaration(
        address indexed certIssuer, string name,
        string email, string phone, string additionalInfo
    );
    /// Event emitted upon ring 2 declaration
    event RingTwoDeclaration(
        address indexed certIssuer, string domainControlled
    );
    /// Event emitted upon ring 2 challenge initialization
    event RingTwoChallengeInit(
        address indexed certIssuer, uint256 indexed challengeId
    );
    /// Event emitted upon the result of ring 2 challenge is accessible
    event RingTwoChallengeResult(
        address indexed certIssuer, uint256 indexed challengeId,
        string domainControlled, uint256 expiration,
        bool successful
    );

    /**
     * @notice Declare the detail of the certificate issuser (under your address) to obtain ring 3 validation status
     * @param name string name of the certificate issuer
     * @param phone string Phone number of the certificate issuer
     * @param email string Email of the certificate issuer
     * @param additionalInfo string Additional information of the certificate issuer
     * @dev It is allowed to use empty string in case the organization did not want to declare those details
     * @dev Organization that wants to declare a website should declare it using ring 2 declaration
     * @dev No delegate calling is allowed to protect users from malicous use of the system
     */
    function ringThreeDeclaration(
        string calldata name, string calldata email, string calldata phone, string calldata additionalInfo
    ) external {
        // Grant ring 3 status
        ringThree[msg.sender] = true;
        // Emit RingThreeDeclaration event
        emit RingThreeDeclaration(msg.sender, name, email, phone, additionalInfo);
    }

    /**
     * @notice Get the number of block time granted per successful ring 2 validation
     * @return uint256 number of block time granted per successful ring 2 validation
     */
    function getRingTwoValidityPeriod() public pure returns (uint256) {
        return RING_TWO_VALIDITY_PERIOD;
    }

    /**
     * @notice Get the current ring of validation that the certificate issuer has
     * @param issuer address address of the certificate issuer
     * @return uint256 ring validation status
     * @dev Either 4 (no validation), 3 (ring 3) or 2 (ring 2) is returned
     */
    function getRing(address issuer) internal view returns (uint256) {
        if (!ringThree[issuer]) {
            // No record in ringThree, must be ring 4
            return 4;
        }
        else if (ringTwoExpire[issuer] < block.number) {
            // Ring 2 validation does not exist or is expired already
            return 3;
        }
        else {
            // Valid ring 2 validation
            return 2;
        }
    }

    /**
     * @notice Get the current status of validation that the certificate issuer has
     * @param issuer address address of the certificate issuer
     * @return (uint256, uint256) ring validation status, block number of issue and expiration
     * @dev Either 4 (no validation), 3 (ring 3) or 2 (ring 2 or above) is returned in the first value
     * @dev The block number when the party receive their ring 2 status is returned in the second value, or 0 if issuer has no valid ring 2 status
     * @dev The block number when the party's ring 2 status will expire is returned in the third value, or 0 if issuer has no valid ring 2 status
     */
    function getStatus(address issuer) external view returns (uint256, uint256, uint256) {
        uint256 currentRing = getRing(issuer);
        if (currentRing == 2) {
            // Ring 2 validation
            return (currentRing, ringTwoIssue[issuer], ringTwoExpire[issuer]);
        }
        else {
            // Ring 3/4 validation
            return (currentRing, 0, 0);
        }
    }

    /**
     * @notice Declare a domain controlled by msg.sender to prepare for ring 2 validation
     * @param domainControlled string a domain controlled by msg.sender
     * @dev Reverts if msg.sender do not have a minimum of ring 3 validation at the moment
     * @dev If called when ring 2 validation is still effective, it would reset msg.sender to ring 3 validation
     * @dev No delegate calling is allowed to protect users from malicous use of the system
     */
    function ringTwoDeclaration(string calldata domainControlled) external {
        // Get the current ring validation status of msg.sender
        uint256 ring = getRing(msg.sender);
        // Ensure msg.sender has ring 3 validation or above
        require(ring <= 3, "CerticolCA: ring 3 validation is required before ring 2 validation process");
        // Reset ring 2 validation if msg.sender already has a valid ring 2 validation
        if (ring == 2) {
            // Reset ring 2 validation before resetting the ringTwoDeclaredWebsite
            ringTwoIssue[msg.sender] = 0;
            ringTwoExpire[msg.sender] = 0;
        }
        // Update ringTwoDeclaredWebsite
        ringTwoDeclaredWebsite[msg.sender] = domainControlled;
        // Emit RingTwoDeclaration
        emit RingTwoDeclaration(msg.sender, domainControlled);
    }

    /**
     * @notice Initialize a ring 2 validation challenge for issuer
     * @param issuer address the address of the certificate issuer who controls the claimed domain
     * @dev Reverts if issuer have not completed ring 2 declaration
     * @dev You should listen to event RingTwoInitialization to acquire the challengeId of the initialized challenge
     * @dev It is intentional that this can be called by a delegate to allow a third-party to help with the ring 2 validation process
     * @dev However, since ringTwoDeclaration can only be called by msg.sender himself, this should poses little risk to the users
     */
    function ringTwoChallengeInit(address issuer) external {
        // Check for whether a domain has been declared
        string memory declaredDomain = ringTwoDeclaredWebsite[issuer];
        require(bytes(declaredDomain).length != 0, "CerticolCA: msg.sender has not completed ring 2 declaration");
        // Initialize challenge and obtain the challengeId
        uint256 challengeId = initChallenge(issuer, declaredDomain);
        // Record the challengeId
        challengeMap[challengeId] = issuer;
        // Emit RingTwoChallengeInit
        emit RingTwoChallengeInit(issuer, challengeId);
    }

    /**
     * @notice Solve ring 2 validation challenge for msg.sender
     * @dev Reverts if challengeId is not initialized by msg.sender, or is non-existence
     * @dev You should listen to event RingTwoValidated or RingTwoFailed for the validation result
     * @dev Correct amount of Ethereum must be sent together with this function call as returned by getProvableCost
     * @dev The cost is dependent on the gas price used in the transaction that calls this function
     * @dev Since the callback from Provable would use an identical gas price as the gas price used in the transaction
     * @dev It is intentional that this can be called by a delegate to allow a third-party to help with the ring 2 validation process
     * @dev However, since ringTwoDeclaration can only be called by msg.sender himself, this should poses little risk to the users
     */
    function ringTwoChallengeSolve(uint256 challengeId) external payable {
        // Check if challengeId is non-existence
        require(challengeMap[challengeId] != address(0), "CerticolCA: no challenge with that id was found");
        // Call underlying solveChallenge
        solveChallenge(challengeId);
    }

    /**
     * @notice Implement the secondary callback function from HTTPChallenge
     * @param challengeId uint256 challenge ID
     * @param validated bool validation status of the challenge
     */
    function _callbackChild(uint256 challengeId, bool validated) internal {
        // Get the address of the challenge owner
        address challengeOwner = challengeMap[challengeId];
        // Check if the validation is successful or not
        if (validated) {
            // Ring 2 challenge is successful, grant ring 2 validation
            // Update ringTwoIssue if necessary
            if (ringTwoIssue[challengeOwner] == 0 || ringTwoExpire[challengeOwner] < block.number) {
                // Set ringTwoIssue as current block since the certIssuer does not currently has a valid ring 2 status
                ringTwoIssue[challengeOwner] = block.number;
                // No need to update if they currently owns a valid ring 2 status
            }
            // Effective block time would be current block + 1051200‬ blocks (roughly 6 months)
            ringTwoExpire[challengeOwner] = block.number + getRingTwoValidityPeriod();
        }
        // Emit RingTwoChallengeResult
        emit RingTwoChallengeResult(
            challengeOwner, challengeId,
            ringTwoDeclaredWebsite[challengeOwner], ringTwoExpire[challengeOwner],
            validated
        );
    }

}