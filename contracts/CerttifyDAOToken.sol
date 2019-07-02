pragma solidity 0.5.3;

import '../node_modules/openzeppelin-solidity/contracts/token/ERC777/ERC777.sol';
import '../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol';
import '../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol';
import './ICerttifyDAOToken.sol';

/**
 * @title CerttifyDAO Token Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts defines a token that grants owners a right to participate in the decentralized governance
 * of Certtify protocol - CerttifyDAO.
 *
 * @dev This token contract obeys the ERC-777 standard while being backward compatible to ERC-20 standard.
 */
contract CerttifyDAOToken is ERC777, Ownable, ICerttifyDAOToken {

    /// Use safe math
    using SafeMath for uint256;

    /// Define token specification according to ERC-777
    string constant TOKEN_NAME = "CerttifyDAO Token";
    string constant SYMBOL = "CDT";
    address[] private DEFAULT_OPERATORS = new address[](0);

    /// Initial token supply is 10,000,000 CDT
    uint256 private INITIAL_SUPPLY = uint256(10000000).mul(uint256(10**18));

    /**
     * @notice Initialize the CerttifyDAOToken contract
     * @param wallet address address that would receive the initial minted token
     * @param DAO address address of the CerttifyDAO
     */
    constructor(address wallet, address DAO) ERC777(TOKEN_NAME, SYMBOL, DEFAULT_OPERATORS) public {
        // Check input
        require(wallet != address(0), "CDT: initial token send to the zero address");
        require(DAO != address(0), "CDT: DAO address cannot be the zero address");
        // Mint initial token supply
        _mint(msg.sender, wallet, INITIAL_SUPPLY, "", "");
        // Transfer ownership to CerttifyDAO
        transferOwnership(DAO);
    }

    /**
     * @notice Mint interest for recipient to allow CerttifyDAO to observe the Certtify protocol
     * @param recipient address address that would receive the minted interest
     * @param amount uint256 amount of interest to be minted
     */
    function mintInterest(address recipient, uint256 amount) external onlyOwner() {
        // Mint interest for recipient
        _mint(msg.sender, recipient, amount, "", "");
    }

}