pragma solidity 0.5.3;

/**
 * @title ICerticolCA Interface
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice Interface of the CerticolCA as defined in the Certicol protocol.
 */
interface ICerticolCA {

    /**
     * @notice Get the current status of validation that the certificate issuer has
     * @param issuer address address of the certificate issuer
     * @return (uint256, uint256) ring validation status, block number of issue and expiration
     * @dev Either 4 (no validation), 3 (ring 3) or 2 (ring 2 or above) is returned in the first value
     * @dev The block number when the party receive their ring 2 status is returned in the second value
     * @dev The block number when the party's ring 2 status will expire is returned in the third value
     */
    function getStatus(address issuer) external view returns (uint256, uint256, uint256);

}