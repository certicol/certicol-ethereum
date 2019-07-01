pragma solidity 0.5.3;

import '../node_modules/openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol';
import '../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol';

/**
 * @title Certtify Certificate Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts defines certificate as specified in the Certtify Zero protocol.
 *
 * @dev This token contract obeys the ERC-721 standard.
 */
contract CerttifyCert is ERC721Full {

    /// Define metadata according to ERC-721
    string constant NAME = "Certtify Certificate";
    string constant SYMBOL = "CTC";

    /// Mapping from certificate ID to certificate issuer
    mapping(uint256 => address) private _certIssuser;
    // Mapping from certificate ID to whether it is revocable
    mapping(uint256 => bool) private _certRevocable;
    // Mapping from certificate ID to whether it is revoked
    mapping(uint256 => bool) private _certRevoked;

    /// Certificate issuing event - storing its content, expiry block, hash flag, and OPC flag
    event IssueCert(uint256 indexed certId, bytes cert, uint256 expiryBlock, bool isHashed, bool isOPC);
    /// Certificate revoking event
    event RevokeCert(uint256 indexed certId);

    /**
     * @notice Initialize the CerttifyCert contract
     */
    constructor() ERC721Full(NAME, SYMBOL) public {
    }

    /**
     * @notice Issue a certificate in accordance to the Certtify Zero protocol
     * @param cert bytes content of the certificate to be stored in the blockchain
     * @param receiver address receiver of the certificate; setting it to the NO-RECEIVER-ADDRESS address would indicate the certificate has no direct receiver on the blockchain
     * @param expiryBlock uint256 block number where the certificate would expire; setting it to 0 would indicate the certificate will not expire
     * @param revocable bool grant msg.sender the right to revoke this certificate after issuing if true
     * @param isHashed bool flag that stated whether the certificate content is hashed or not; pass false if the content is in clear-text.
     * @param isOPC bool flag that stated whether proof-of-ownership is required upon validation; pass false if the content alone is sufficient upon validation.
     */
    function issueCert(bytes calldata cert, address receiver, uint256 expiryBlock, bool revocable, bool isHashed, bool isOPC) external {
        // Compute an unique hash for the certificate by sha3(cert_content, block_number)
        uint256 certId = uint256(keccak256(abi.encodePacked(cert, block.number)));
        // Mint the certificate
        _mint(receiver, certId);
        // Set the relevant metadata for the certificate
        _certIssuser[certId] = msg.sender;
        _certRevocable[certId] = revocable;
        // Log the certificate content, isHashed and isOPC flag
        emit IssueCert(certId, cert, expiryBlock, isHashed, isOPC);
    }

    /**
     * @notice Revoke an issued certificate. This function is only available if the certificate is revocable and if msg.sender is the issuer of the certificate.
     * @param certId uint256 certificate ID of the certificate queried
     */
    function revokeCert(uint256 certId) external {
        // Revoking a certificate MUST flow if the certificate is NOT revocable, or if msg.sender != issuer
        require(_certRevocable[certId], "CTC: only revocable certificate can be revoked");
        require(msg.sender == _certIssuser[certId], "CTC: only certificate issuer can revoke a certificate");
        // Update revoked flag for certId
        _certRevoked[certId] = true;
        // Log the event
        emit RevokeCert(certId);
    }

    /**
     * @notice Get the receiver address of 'certificate without receiver' in accordance to the Certtify Zero protocol
     * @return address that should be used as the receiver when there is no direct receiver in the blockchain
     */
    function noReceiverAddress() external pure returns (address) {
        return address(uint256(keccak256("CTC-NO-RECEIVER-ADDRESS")));
    }

    /**
     * @notice List the current status of a certificate in accordance to the Certtify Zero protocol
     * @param certId uint256 certificate ID of the certificate queried
     * @return List of the issuer, receiver ,revocable, revoked status of the certificate
     */
    function getCertStatus(uint256 certId) external view returns (address, address, bool, bool) {
        return (_certIssuser[certId], ownerOf(certId), _certRevocable[certId], _certRevoked[certId]);
    }

}