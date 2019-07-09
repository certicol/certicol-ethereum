pragma solidity 0.5.3;

import './CerticolCA.sol';

/**
 * @title Testing erticol Certification Authority (CA) Contract
 *
 * @author Ken Sze <acken2@outlook.com>
 *
 * @notice This contracts redefines getRingTwoValidityPeriod() to 100 for easier testing. Do NOT use in production environment.
 */
contract CerticolCATest is CerticolCA {

    /**
     * @notice Get the number of block time granted per successful ring 2 validation
     * @return uint256 number of block time granted per successful ring 2 validation
     * @dev This function is overrided from 1051200 to 100 for easier testing
     */
    function getRingTwoValidityPeriod() public pure returns (uint256) {
        super.getRingTwoValidityPeriod(); // For coverage :}
        return 100;
    }

}