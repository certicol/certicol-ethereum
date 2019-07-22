pragma solidity 0.5.3;

import './CerticolDAOToken.sol';

/**
 * @title Gas Token Interface
 *
 * @notice Copied from https://github.com/projectchicago/gastoken/blob/master/contract/gst2_free_example.sol
 */
contract GST1 {
    function freeFrom(address from, uint256 value) public returns (bool success);
}

/**
 * @title CerticolDAO Token Deployer Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts is used to deploy Certicol DAO token with GasToken to reduce deployment cost.
 */
contract CerticolDAOTokenDeployer {

    /**
     * @notice Deploy Certicol DAO token contract
     * @param gstContract address the address of deployed GST1 contract
     * @param wallet address address that would receive the initial minted token
     */
    constructor(address gstContract, address wallet) public {
        require(GST1(gstContract).freeFrom(msg.sender, 168), 'CerticolCADeployer: unable to free the pre-defined GST1');
        CerticolDAOToken CDT = new CerticolDAOToken(wallet);
        CDT.transferOwnership(msg.sender);
    }

}