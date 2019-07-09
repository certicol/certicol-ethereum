pragma solidity 0.5.3;

import 'openzeppelin-solidity/contracts/token/ERC777/ERC777.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import './ICerticolDAOToken.sol';

/**
 * @title CerticolDAO Token Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts defines a token that grants owners a right to participate in the decentralized governance
 * of Certicol protocol - CerticolDAO.
 *
 * @dev This token contract obeys the ERC-777 standard while being backward compatible to ERC-20 standard.
 */
contract CerticolDAOToken is ERC777, Ownable, ICerticolDAOToken {

    /// Use safe math
    using SafeMath for uint256;

    /// Define token specification according to ERC-777
    string constant TOKEN_NAME = "CerticolDAO Token";
    string constant SYMBOL = "CDT";
    address[] private DEFAULT_OPERATORS = new address[](0);

    /// Define initial supply as 10,000,000 CDT
    uint256 constant INITIAL_SUPPLY = uint256(10000000);

    /**
     * @notice Initialize the CerticolDAOToken contract
     * @param wallet address address that would receive the initial minted token
     */
    constructor(address wallet) ERC777(TOKEN_NAME, SYMBOL, DEFAULT_OPERATORS) public {
        // Check input
        require(wallet != address(0), "CDT: initial token send to the zero address");
        // Mint initial token supply
        uint256 initialSupply = INITIAL_SUPPLY.mul(uint256(10**18));
        _mint(msg.sender, wallet, initialSupply, "", "");
    }

    /**
     * @notice Mint interest for recipient to allow CerticolDAO to observe the Certicol protocol
     * @param recipient address address that would receive the minted interest
     * @param amount uint256 amount of interest to be minted
     */
    function mintInterest(address recipient, uint256 amount) external onlyOwner() {
        // Mint interest for recipient
        _mint(msg.sender, recipient, amount, "", "");
    }

}