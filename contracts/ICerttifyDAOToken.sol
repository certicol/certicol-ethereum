pragma solidity 0.5.3;

/**
 * @title ICerttifyDAO Interface
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice Interface of the CerttifyDAOToken as defined in the Certtify Zero protocol.
 *
 * @dev It should be noted that although CerttifyDAOToken has also implemented both ERC-20 and ERC-777 interface.
 */
interface ICerttifyDAOToken {

    /**
     * @notice Mint interest for recipient to allow Certtify DAO to observe the Certtify protocol
     * @param recipient address address that would receive the minted interest
     * @param amount uint256 amount of interest to be minted
     * @dev this function should throw when not operated by the Certtify DAO
     */
    function mintInterest(address recipient, uint256 amount) external;

}