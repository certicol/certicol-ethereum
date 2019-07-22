pragma solidity 0.5.3;

import './CerticolDAO.sol';

/**
 * @title Gas Token Interface
 *
 * @notice Copied from https://github.com/projectchicago/gastoken/blob/master/contract/gst2_free_example.sol
 */
contract GST1 {
    function freeFrom(address from, uint256 value) public returns (bool success);
}

/**
 * @title Certicol DAO Deployer Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts is used to deploy Certicol DAO with GasToken to reduce deployment cost.
 */
contract CerticolDAODeployer {

    /**
     * @notice Deploy Certicol DAO contract
     * @param gstContract address the address of deployed GST1 contract
     * @param tokenAddress address the address of the deployed CerticolDAOToken contract
     * @param caAddress address the address of the deployed CerticolCA contract
     */
    constructor(address gstContract, address tokenAddress, address caAddress) public {
        require(GST1(gstContract).freeFrom(msg.sender, 243), 'CerticolCADeployer: unable to free the pre-defined GST1');
        new CerticolDAO(tokenAddress, caAddress);
    }

}