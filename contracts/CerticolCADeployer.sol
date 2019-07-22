pragma solidity 0.5.3;

import './CerticolCA.sol';

/**
 * @title Gas Token Interface
 *
 * @notice Copied from https://github.com/projectchicago/gastoken/blob/master/contract/gst2_free_example.sol
 */
contract GST1 {
    function freeFrom(address from, uint256 value) public returns (bool success);
}

/**
 * @title Certicol Certification Authority (CA) Deployer Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts is used to deploy Certicol CA with GasToken to reduce deployment cost.
 */
contract CerticolCADeployer {

    /**
     * @notice Deploy Certicol CA contract
     * @param gstContract address the address of deployed GST1 contract
     */
    constructor(address gstContract) public {
        require(GST1(gstContract).freeFrom(msg.sender, 167), 'CerticolCADeployer: unable to free the pre-defined GST1');
        new CerticolCA();
    }

}