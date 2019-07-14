pragma solidity 0.5.3;

import './CerticolCATestStandard.sol';

/**
 * @title Coverage-Used Certicol Certification Authority (CA) Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts increases Provable callback gas limit by 10x. Do NOT use in production environment.
 */
contract CerticolCATestCoverage is CerticolCATestStandard {

    /**
     * @notice Override default provable_getPrice function in provableAPI_0.5.sol
     */
    function provable_getPrice(string memory _datasource, uint) internal provableAPI returns (uint _queryPrice) {
        return provable.getPrice(_datasource, 1052760);
    }

    /**
     * @notice Override default provable_query function in provableAPI_0.5.sol
     */
    function provable_query(string memory _datasource, string memory _arg, uint) internal provableAPI returns (bytes32 _id) {
        uint price = provable.getPrice(_datasource, 1052760);
        return provable.query_withGasLimit.value(price)(0, _datasource, _arg, 1052760);
    }

}