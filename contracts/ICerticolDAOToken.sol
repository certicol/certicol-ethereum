pragma solidity 0.5.3;

/**
 * @title ICerticolDAO Interface
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice Interface of the CerticolDAOToken as defined in the Certicol protocol.
 *
 * @dev It should be noted that although CerticolDAOToken has also implemented both ERC-20 and ERC-777 interface.
 */
interface ICerticolDAOToken {

    /**
     * @notice Mint interest for recipient to allow Certicol DAO to observe the Certicol protocol
     * @param recipient address address that would receive the minted interest
     * @param amount uint256 amount of interest to be minted
     * @dev this function should throw when not operated by the Certicol DAO
     */
    function mintInterest(address recipient, uint256 amount) external;

}