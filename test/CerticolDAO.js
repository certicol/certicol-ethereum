// Import library function
const { singletons, BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
const CerticolCA = artifacts.require('CerticolCA');
var CerticolCATest;
const CerticolCATestStandard = artifacts.require('CerticolCATestStandard');
const CerticolCATestCoverage = artifacts.require('CerticolCATestCoverage');
const CerticolDAO = artifacts.require('CerticolDAO');
const CerticolDAOToken = artifacts.require('CerticolDAOToken');

// Test for CerticolDAOToken.sol
contract('CerticolDAO', function(accounts) {

    // Storing instance of deployed DAO contract
    var contractInstance;
    // Storing instance of deployed CDT token
    var tokenInstance;
    // Storing instance of deployed CerticolCA
    var caInstance;

    // Deploy ERC-1820 before any tests since ERC-777 and the DAO is dependent upon it
    before(async function() {
        // Source: https://github.com/OpenZeppelin/openzeppelin-solidity/issues/1743#issuecomment-491472245
        await singletons.ERC1820Registry(accounts[0]);
        // Select CerticolCA contract abstraction to use
        let lastBlock = await web3.eth.getBlock("latest");
        if (await lastBlock.gasLimit == 17592186044415) {
            // Swap to coverage-only CerticolCA if on coverage network
            CerticolCATest = CerticolCATestCoverage;
        }
        else {
            // Use normal CerticolCATest
            CerticolCATest = CerticolCATestStandard;
        }
    });

    describe('Initialization and Deployment', function() {

        beforeEach(async function() {
            tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
            caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
            contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
            await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
        });

        it('should own CerticolDAOToken', async function() {
            expect(await tokenInstance.owner()).to.have.string(contractInstance.address); // Expected DAO to own the CDT contract
        });

        it('should initialize token-related mappings', async function() {
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 tokens locked as default
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 voting rights as default
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 PoSaT credits as default
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 locked PoSaT credits as default
        });

        it('should initialize delegate-related mappings', async function() {
            expect(await contractInstance.getDelegatedVotingRights(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated voting rights as default
            expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 net delegated voting rights as default
            expect(await contractInstance.getDelegatedPoSaT(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated PoSaT credits as default
            expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 net delegated PoSaT credits as default
        });

        it('should initialize O10-related getter functions', async function() {
            expect(await contractInstance.getO10Requirements()).to.be.bignumber.equal(new BN("90000000" + "0".repeat(18)).div(new BN(10))); // Expected 10% of initial supply as O10 requirements
            expect(await contractInstance.getO10Status(accounts[1])).to.be.false; // Expected no O10 authorization by default
            expect(await contractInstance.getVOCRequirement()).to.be.bignumber.equal(new BN("10000" + "0".repeat(18))); // Expected 10,000 CDT required to vote confidence
            expect(await contractInstance.getActiveVoCIssued(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 active vote by default
            expect(await contractInstance.getVoC(accounts[2])).to.have.lengthOf(0); // Expected array length of 0
            expect(await contractInstance.getVoCFrom(accounts[2], accounts[1])).to.be.false; // Expected no voc from accounts[1] to accounts[2] by default
            expect(await contractInstance.getCurrentPoSaTReward()).to.be.bignumber.equal(new BN(5)); // Expected 5% PoSaT reward by default
            expect(await contractInstance.getCurrentPoSaTRequirement()).to.be.bignumber.equal(new BN(2102400)); // Expected 2102400 blocks required per reward cycle by default
            expect(await contractInstance.getCurrentRingOneRequirement()).to.be.bignumber.equal(new BN(25)); // Expected 25% cumulative PoSaT credits required for ring 1 status
            expect(await contractInstance.getCurrentRing(accounts[2])).to.be.bignumber.equal(new BN(4)); // Expected ring 4 validation status by default
        });

        it('should initialize O5-related getter functions', async function() {
            expect(await contractInstance.getSeedUsed(new BN(0))).to.be.false; // Expected seed to be unused
            expect(await contractInstance.getDAODissolved()).to.be.false; // Expected DAO to be NOT dissolved
            expect(await contractInstance.getO5VoteNoConfidence(constants.ZERO_ADDRESS)).to.be.false; // Expected any account would not be voted no confidence by default
        });

    });

    describe('Basic Token Lock and Release Mechanics', function() {

        const INITIAL_SUPPLY = new BN("90000000" + "0".repeat(18));

        beforeEach(async function() {
            tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
            caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
            contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
            await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
        });

        it('should accept token deposit and lock those token', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            let event = await contractInstance.getPastEvents('TokensLocked', { filter: { tokenHolder: accounts[0] } }); // Since TokensLocked event is emitted in another contract, it is not included in the transaction log
            expectEvent.inLogs(event, 'TokensLocked', { tokenHolder: accounts[0], amount: new BN(100) }); // Expected TokensLocked event
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100)); // Expected that DAO contract now owns 100 CDT
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100))); // Expected that accounts[0] has 100 fewer CDT
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 locked tokens
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
            expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(100)); // Expected 100 cumulative tokens locked
        });

        it('should revert token deposit if deposit more than what they owned', async function() {
            await expectRevert(tokenInstance.transfer(contractInstance.address, 1, { from: accounts[1] }), 'SafeMath: subtraction overflow'); // Transfer and lock 1 tokens to DAO from accounts[1], who owns no token and therefore failed
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(0)); // Expected that DAO contract now owns 0 CDT
            expect(await tokenInstance.balanceOf(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected that accounts[1] still has 0 CDT
            expect(await contractInstance.getTokensLocked(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 locked tokens
            expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has no locked PoSaT credits
            expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(0)); // Expected 0 cumulative tokens locked
        });

        it('should revert token deposit if it is not the designated CDT token', async function() {
            let fakeTokenInstance = await CerticolDAOToken.new(accounts[1], { from: accounts[1] }); // Fake CDT token contract
            await expectRevert(fakeTokenInstance.transfer(contractInstance.address, 100, { from: accounts[1] }), 'CerticolDAO: we only accept CDT token');
            // Transfer should failed since it is not the recognized CDT token
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(0)); // Expected that DAO contract owns 0 CDT
            expect(await contractInstance.getTokensLocked(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 locked tokens
            expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has no locked PoSaT credit
            expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(0)); // Expected 0 cumulative tokens locked
        });

        it('should accept withdrawl of locked tokens and adjust voting rights and PoSaT credit accordingly', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            tx = await contractInstance.withdrawToken(50, { from: accounts[0] }); // Withdraw 50 locked tokens back
            expectEvent.inLogs(tx.logs, 'TokensUnlocked', { tokenHolder: accounts[0], amount: new BN(50) }); // Expected TokensUnlocked event
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected that DAO contract now owns 100 - 50 CDT
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100)).add(new BN(50))); // Expected that accounts[0] has 50 more CDT
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 locked tokens only
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 voting rights only
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 PoSaT credits only
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
            expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(50)); // Expected 50 cumulative tokens locked
        });

        it('should not accept withdrawl of locked tokens if it exceeds the number of tokens they have locked', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            await expectRevert(contractInstance.withdrawToken(101, { from: accounts[0] }), 'SafeMath: subtraction overflow'); // Withdraw 101 locked tokens back, which should fail
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100)); // Expected that DAO contract still owns 100 CDT
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100))); // Expected that accounts[0] still has 100 fewer CDT
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 locked tokens
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
            expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(100)); // Expected 100 cumulative tokens locked
        });

    });

    describe('Delegation Mechanics', function() {

        describe('Voting Rights Delegation Mechanics', function() {

            // Deploy the contract before each test
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // 100 tokens is locked from accounts[0] into the contract
            });
    
            it('should accept delegation of voting rights', async function() {
                let tx = await contractInstance.delegateVotingRights(constants.ZERO_ADDRESS, 100, { from: accounts[0] }); // Delegate 100 voting rights to 0x0
                expectEvent.inLogs(tx.logs, 'VotingRightsDelegation', { tokenHolder: accounts[0], delegate: constants.ZERO_ADDRESS, amount: new BN(100) }); // Expected VotingRightsDelegation event
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 100 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 voting rights (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 delegated rights from accounts[0] to 0x0
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected a net of 100 delegated rights from accounts[0]
            });
    
            it('should accept increased delegation of voting rights', async function() {
                await contractInstance.delegateVotingRights(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate 50 voting rights to 0x0
                await contractInstance.delegateVotingRights(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate another 50 voting rights to 0x0
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 voting rights (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 delegated rights from accounts[0] to 0x0
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected a net of 100 delegated rights from accounts[0]
            });        
    
            it('should not accept delegation if it exceeds the amount of voting rights msg.sender owns', async function() {
                await contractInstance.delegateVotingRights(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate 50 voting rights to 0x0
                await expectRevert(contractInstance.delegateVotingRights(accounts[1], 51, { from: accounts[0] }), 'CerticolDAO: insufficient voting rights or secondary delegation is not permitted');
                // Reject since msg.sender only have 100 - 50 voting rights left (51 required)
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 voting rights in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to 0x0
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated rights from accounts[0]
            });
    
            it('should not accept secondary delegation', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                await expectRevert(contractInstance.delegateVotingRights(accounts[2], 25, { from: accounts[1] }), 'CerticolDAO: insufficient voting rights or secondary delegation is not permitted');
                // Although accounts[1] has 50 voting rights, but since secondary delegation is banner, accounts[1] cannot further delegate 20 voting rights to accounts[2]
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getVotingRights(accounts[2])).to.be.bignumber.equal(new BN(0)); // Expected 0 voting rights in accounts[2]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[1], accounts[2])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated rights from accounts[1] to accounts[2]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated rights from accounts[0]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected a net of 0 delegated rights from accounts[1]
            });
    
            it('should accept the withdrawl of locked tokens if msg.sender still have sufficient voting rights', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                await contractInstance.withdrawToken(50, { from: accounts[0] }); // Since accounts[0] only had 50 voting rights, it can withdraw up to 50 CDT, so this should work
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected accounts[0] has 100 - 50 locked tokens only
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated rights from accounts[0]
            });
    
            it('should not accept the withdrawl of locked tokens if msg.sender does not have sufficient voting rights', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                await expectRevert(contractInstance.withdrawToken(51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Since accounts[0] only had 50 voting rights, it can only withdraw up to 50 CDT, so this should fail
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 locked tokens
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated rights from accounts[0]
            });
    
            it('should accept complete withdrawl of delegated voting rights', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                let tx = await contractInstance.withdrawDelegatedVotingRights(accounts[1], 50, { from: accounts[0] }); // Withdraw 40 delegated voting rights from accounts[1]
                expectEvent.inLogs(tx.logs, 'VotingRightsDelegationWithdrawl', { tokenHolder: accounts[0], delegate: accounts[1], amount: new BN(50) }); // Expected VotingRightsDelegationWithdrawl event
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected 100 - 50 + 50 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 50 - 50 voting rights in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected a net of 0 delegated rights from accounts[0]
            });
    
            it('should accept decreased in delegated voting rights', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                await contractInstance.withdrawDelegatedVotingRights(accounts[1], 40, { from: accounts[0] }); // Withdraw 40 delegated voting rights from accounts[1]
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(90)); // Expected 100 - 50 + 40 voting rights left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(10)); // Expected 50 - 40 voting rights in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(10)); // Expected 10 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(10)); // Expected a net of 10 delegated rights from accounts[0]
            });
    
            it('should not accept withdrawl of delegated voting rights if amount > total delegated voting rights', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
                await expectRevert(contractInstance.withdrawDelegatedVotingRights(accounts[1], 51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Withdraw 51 delegated voting rights from accounts[1] which should failed
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 voting rights still left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights still in accounts[1]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 0 delegated rights from accounts[0]
            });
    
            it('should not accept withdrawl of delegated voting rights if amount > delegated voting rights to the delegate', async function() {
                await contractInstance.delegateVotingRights(accounts[1], 40, { from: accounts[0] }); // Delegate 40 voting rights to accounts[1]
                await contractInstance.delegateVotingRights(accounts[2], 40, { from: accounts[0] }); // Delegate 40 voting rights to accounts[2]
                await expectRevert(contractInstance.withdrawDelegatedVotingRights(accounts[1], 41, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Withdraw 41 delegated voting rights from accounts[1] which should failed since 41 > 40
                expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(20)); // Expected 100 - 80 voting rights still left in accounts[0]
                expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(40)); // Expected 40 voting rights still in accounts[1]
                expect(await contractInstance.getVotingRights(accounts[2])).to.be.bignumber.equal(new BN(40)); // Expected 40 voting rights still in accounts[2]
                expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(40)); // Expected 40 delegated rights from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(80)); // Expected a net of 80 delegated rights from accounts[0]
            });
    
        });
    
        describe('PoSaT Credits Delegation Mechanics', function() {
    
            // Deploy the contract before each test
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // 100 tokens is locked from accounts[0] into the contract
            });
    
            it('should accept delegation of PoSaT credits', async function() {
                let tx = await contractInstance.delegatePoSaT(constants.ZERO_ADDRESS, 100, { from: accounts[0] }); // Delegate 100 PoSaT credits to 0x0
                expectEvent.inLogs(tx.logs, 'PoSaTDelegation', { tokenHolder: accounts[0], delegate: constants.ZERO_ADDRESS, amount: new BN(100) }); // Expected PoSaTDelegation event
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 100 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 PoSaT credits (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 delegated PoSaT credits from accounts[0] to 0x0
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected a net of 100 delegated PoSaT credits from accounts[0]
            });
    
            it('should accept increased delegation of PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to 0x0
                await contractInstance.delegatePoSaT(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate another 50 PoSaT credits to 0x0
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 PoSaT credits (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(100)); // Expected 100 delegated PoSaT credits from accounts[0] to 0x0
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected a net of 100 delegated PoSaT credits from accounts[0]
            });        
    
            it('should not accept delegation if it exceeds the amount of PoSaT credits msg.sender owns', async function() {
                await contractInstance.delegatePoSaT(constants.ZERO_ADDRESS, 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to 0x0
                await expectRevert(contractInstance.delegatePoSaT(accounts[1], 51, { from: accounts[0] }), 'CerticolDAO: insufficient PoSaT credits or secondary delegation is not permitted');
                // Reject since msg.sender only have 100 - 50 PoSaT credits left (51 required)
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits (delegated from accounts[0]) in 0x0
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 PoSaT credits in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], constants.ZERO_ADDRESS)).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to 0x0
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated PoSaT credits from accounts[0]
            });
    
            it('should not accept secondary delegation', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                await expectRevert(contractInstance.delegatePoSaT(accounts[2], 25, { from: accounts[1] }), 'CerticolDAO: insufficient PoSaT credits or secondary delegation is not permitted');
                // Although accounts[1] has 50 PoSaT credits, but since secondary delegation is banned, accounts[1] cannot further delegate 20 PoSaT credits to accounts[2]
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getAvailablePoSaT(accounts[2])).to.be.bignumber.equal(new BN(0)); // Expected 0 PoSaT credits in accounts[2]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[1], accounts[2])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated PoSaT credits from accounts[1] to accounts[2]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated PoSaT credits from accounts[0]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected a net of 0 delegated PoSaT credits from accounts[1]
            });
    
            it('should accept the withdrawl of locked tokens if msg.sender still have sufficient PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                await contractInstance.withdrawToken(50, { from: accounts[0] }); // Since accounts[0] only had 50 PoSaT credits, it can withdraw up to 50 CDT, so this should work
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected accounts[0] has 100 - 50 locked tokens only
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated PoSaT credits from accounts[0]
            });
    
            it('should not accept the withdrawl of locked tokens if msg.sender does not have sufficient PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                await expectRevert(contractInstance.withdrawToken(51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Since accounts[0] only had 50 PoSaT credits, it can only withdraw up to 50 CDT, so this should fail
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 locked tokens
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits (delegated from accounts[0]) in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated PoSaT credits from accounts[0]
            });
    
            it('should accept complete withdrawl of delegated PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                let tx = await contractInstance.withdrawDelegatedPoSaT(accounts[1], 50, { from: accounts[0] }); // Withdraw 40 delegated PoSaT credits from accounts[1]
                expectEvent.inLogs(tx.logs, 'PoSaTDelegationWithdrawl', { tokenHolder: accounts[0], delegate: accounts[1], amount: new BN(50) }); // Expected PoSaTDelegationWithdrawl event
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected 100 - 50 + 50 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 50 - 50 PoSaT credits in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected 0 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected a net of 0 delegated PoSaT credits from accounts[0]
            });
    
            it('should accept decreased in delegated PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                await contractInstance.withdrawDelegatedPoSaT(accounts[1], 40, { from: accounts[0] }); // Withdraw 40 delegated PoSaT credits from accounts[1]
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(90)); // Expected 100 - 50 + 40 PoSaT credits left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(10)); // Expected 50 - 40 PoSaT credits in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(10)); // Expected 10 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(10)); // Expected a net of 10 delegated PoSaT credits from accounts[0]
            });
    
            it('should not accept withdrawl of delegated PoSaT credits if amount > total delegated PoSaT credits', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
                await expectRevert(contractInstance.withdrawDelegatedPoSaT(accounts[1], 51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Withdraw 51 delegated PoSaT credits from accounts[1] which should failed
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected 100 - 50 PoSaT credits still left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits still in accounts[1]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 0 delegated PoSaT credits from accounts[0]
            });
    
            it('should not accept withdrawl of delegated PoSaT credits if amount > delegated PoSaT credits to the delegate', async function() {
                await contractInstance.delegatePoSaT(accounts[1], 40, { from: accounts[0] }); // Delegate 40 PoSaT credits to accounts[1]
                await contractInstance.delegatePoSaT(accounts[2], 40, { from: accounts[0] }); // Delegate 40 PoSaT credits to accounts[2]
                await expectRevert(contractInstance.withdrawDelegatedPoSaT(accounts[1], 41, { from: accounts[0] }), 'SafeMath: subtraction overflow');
                // Withdraw 41 delegated PoSaT credits from accounts[1] which should failed since 41 > 40
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(20)); // Expected 100 - 80 PoSaT credits still left in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(40)); // Expected 40 PoSaT credits still in accounts[1]
                expect(await contractInstance.getAvailablePoSaT(accounts[2])).to.be.bignumber.equal(new BN(40)); // Expected 40 PoSaT credits still in accounts[2]
                expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(40)); // Expected 40 delegated PoSaT credits from accounts[0] to accounts[1]
                expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(80)); // Expected a net of 80 delegated PoSaT credits from accounts[0]
            });
    
        });

    });

    describe('PoSaT Mechanics', function() {

        const INITIAL_SUPPLY = new BN("90000000" + "0".repeat(18));
        const TOKEN_LOCKED = INITIAL_SUPPLY.mul(new BN(2)).div(new BN(3));

        // Storing constant addresses from Provable-Domain for unit testing
        var addressValid = '0x7A490a716f9033E3B3b51aBEAf579B54ecBffd23';
        // Default gas price for Provable callback (10 GWei)
        const GAS_PRICE = '10000000000';
        // Function for obtaining ring 2 validation for addressValid
        var obtainRingII = async function(caInstance) {
            // Set the provider to WebsocketProvider to allow event subscription used in Ring 2 challenge
            let currentHTTPProvider = web3.currentProvider.host;
            caInstance.contract.setProvider(currentHTTPProvider.replace("http", "ws"));
            // Obtain initial ring 2 validation for addressValid
            await caInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: addressValid }
            );
            await caInstance.ringTwoDeclaration(
                'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                { from: addressValid }
            );
            let receipt = await caInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            let cost = await caInstance.getProvableCost.call(GAS_PRICE);
            await caInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            await new Promise(function(resolve) {
                caInstance.contract.events.RingTwoChallengeResult(
                    function(error) {
                        if (error) { revert(error); }
                        resolve();
                    }
                );
            });
        }

        // Function to extract v, r, s value from a signature
        // Copied from https://github.com/ethereum/web3.js/blob/2.x/packages/web3-utils/src/Utils.js
        var getSignatureParameters = function(signature) {
            const r = signature.slice(0, 66);
            const s = `0x${signature.slice(66, 130)}`;
            let v = `0x${signature.slice(130, 132)}`;
            v = web3.utils.hexToNumber(v);
            if (![27, 28].includes(v)) v += 27;
            return {
                r,
                s,
                v
            };
        };
        // Function for signing O5 command and return a signature
        var sign = async function(fnSignature, amendedValue, blockNumber, oneTimeSeed) {
            // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
            let hash = web3.utils.soliditySha3(
                {type: 'string', value: fnSignature},
                {type: 'uint256', value: amendedValue},
                {type: 'uint256', value: blockNumber},
                {type: 'uint256', value: oneTimeSeed}
            );
            return getSignatureParameters(await web3.eth.sign(hash, accounts[0])); // Sign the message using accounts[0] and extract v, r, s components
        }

        // Send addressValid some ether for testing
        before(async function() {
            web3.eth.sendTransaction({
                from: accounts[8],
                to: addressValid,
                value: web3.utils.toWei('450000', 'ether')
            });
        });

        describe('O10 Authorization and Deauthorization', function() {

            // Deploy the contract before each test
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, TOKEN_LOCKED, { from: accounts[0] }); // 66% tokens is locked from accounts[0] into the contract
            });

            it('should grant 010 authorization using non-delegated credits', async function() {
                let tx = await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                expectEvent.inLogs(tx.logs, 'O10Authorized', { O10: accounts[0], PoSaTLocked: O10Requirement }); // Expect O10Authorized event
                expect(await contractInstance.getO10Status(accounts[0])).to.be.true; // Expect O10 status granted
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement)); // Expected available PoSaT to drop by O10 requirement
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement); // Expected O10 requirement to be locked
            });

            it('should grant 010 authorization using delegated credits', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                await contractInstance.delegatePoSaT(accounts[1], O10Requirement); // Delegate enough PoSaT credits to accounts[1] for O10 authorization
                let tx = await contractInstance.O10Authorization({ from: accounts[1] }); // Obtain O10 authorization which should succeed
                expectEvent.inLogs(tx.logs, 'O10Authorized', { O10: accounts[1], PoSaTLocked: O10Requirement }); // Expect O10Authorized event
                expect(await contractInstance.getO10Status(accounts[1])).to.be.true; // Expect O10 status granted
                expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected available PoSaT to drop by O10 requirement - 0
                expect(await contractInstance.getLockedPoSaT(accounts[1])).to.be.bignumber.equal(O10Requirement); // Expected O10 requirement to be locked
            });

            it('should revert O10 authorization request if msg.sender already owned O10 authorization', async function() {
                await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
                await expectRevert(contractInstance.O10Authorization({ from: accounts[0] }), 'CerticolDAO: msg.sender already owned a valid O10 authorization');
            });

            it('should revert O10 authorization request if msg.sender did not have sufficient available PoSaT credits', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let creditToDelegate = TOKEN_LOCKED.sub(O10Requirement).add(new BN(1)); // Delegate available PoSaT credits away such that accounts[0]'s available credit is just below O10 requirement
                await contractInstance.delegatePoSaT(accounts[2], creditToDelegate); // Delegate the PoSaT credits away
                await expectRevert(contractInstance.O10Authorization({ from: accounts[0] }), 'SafeMath: subtraction overflow'); // Expect subtraction overflow as error message since it no longer have enough free credits
                await expectRevert(contractInstance.O10Authorization({ from: accounts[1] }), 'SafeMath: subtraction overflow'); // Expect subtraction overflow as error message since it has no credits
            });

            it('should allow deauthorization of O10 status', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
                let tx = await contractInstance.O10Deauthorization({ from: accounts[0] }); // Deauthorize O10 status
                expectEvent.inLogs(tx.logs, 'O10Deauthorized', { O10: accounts[0], PoSaTUnlocked: O10Requirement }); // Expect O10Deauthorized event
                expect(await contractInstance.getO10Status(accounts[0])).to.be.false; // Expect O10 status removed
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED); // Expected available PoSaT to be identical to token locked
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 0 credits to be locked
            });

            it('should revert deauthorization if there are existing active vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[0] }); // Vote confidence on accounts[1]
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote of confidence now
                await expectRevert(contractInstance.O10Deauthorization({ from: accounts[0] }), 'CerticolDAO: msg.sender still has active PoSaT VoC'); // Expect revert
                expect(await contractInstance.getO10Status(accounts[0])).to.be.true; // Expect O10 status still persist
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement).sub(vocRequirement)); // Expected available PoSaT to decrease by O10 requirement and VoC requirement
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expected O10 requirement and 1 vote of confidence credits to remain locked
            });

            it('should revert deauthorization request if msg.sender did not have O10 authorization', async function() {
                await expectRevert(contractInstance.O10Deauthorization({ from: accounts[0] }), 'CerticolDAO: msg.sender did not owned a valid O10 authorization'); // Expect revert
            });

        });

        describe('O10 Vote of Confidence', function() {

            // Deploy the contract before each test
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCA.new({ from: accounts[1] }); // CerticolCA contract
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, TOKEN_LOCKED, { from: accounts[0] }); // 66% tokens is locked from accounts[0] into the contract
                await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
            });

            it('should allow vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                let tx = await contractInstance.O10VoteConfidence(accounts[1]); // Vote confidence on accounts[1] which should succeed
                expectEvent.inLogs(tx.logs, 'O10VotedConfidence', { O10: accounts[0], target: accounts[1], PoSaTLocked: vocRequirement }); // Expect O10VotedConfidence event
                expect(await contractInstance.getVoC(accounts[1])).to.include.members([ accounts[0] ]); // Expect accounts[0] in reverse VoC record
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[0])).to.be.true; // Expect accounts[0] to have endorsed accounts[1] in VoC record
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote of confidence at the moment
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expect O10 requirement and VoC requirement to be locked
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement).sub(vocRequirement)); // Expect available credits to drop by O10 requirement and VoC requirement
            });

            it('should allow further vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                await contractInstance.delegatePoSaT(accounts[2], O10Requirement.add(new BN(vocRequirement)), { from: accounts[0] }); // Delegate enough PoSaT credits to accounts[2] for O10 authorization and 1 vote
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[0] }); // Vote confidence on accounts[1] from accounts[0] which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[2] }); // Vote confidence on accounts[1] from accounts[2] which should succeed
                expect(await contractInstance.getVoC(accounts[1])).to.include.members([ accounts[0], accounts[2] ]); // Expect accounts[0] and accounts[2] in reverse VoC record
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[0])).to.be.true; // Expect accounts[0] to have endorsed accounts[1] in VoC record
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[2])).to.be.true; // Expect accounts[2] to have endorsed accounts[1] in VoC record
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote from accounts[0] of confidence at the moment
                expect(await contractInstance.getActiveVoCIssued(accounts[2])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote from accounts[2] of confidence at the moment
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expect O10 requirement and VoC requirement to be locked in accounts[0] (P.S. delegation would NOT increase locked PoSaT credits, as it is only affected by participation in the PoSaT mechanism)
                expect(await contractInstance.getLockedPoSaT(accounts[2])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expect O10 requirement and VoC requirement to be locked in accounts[2]
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement).sub(vocRequirement).sub(O10Requirement).sub(vocRequirement)); // Expect available credits to drop by 2x O10 requirement and 2x VoC requirement in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[2])).to.be.bignumber.equal(new BN(0)); // Expect available credits be 0 in accounts[2]
            });

            it('should revert if msg.sender did not have sufficient available PoSaT credits', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                await contractInstance.delegatePoSaT(accounts[2], O10Requirement.add(new BN(1))); // Delegate enough PoSaT credits to accounts[2] for O10 authorization
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization which should succeed
                expectRevert(contractInstance.O10VoteConfidence(accounts[1], { from: accounts[2] }), 'SafeMath: subtraction overflow'); // accounts[2] would not sufficient credit for voting and should failed
            });

            it('should revert vote of confidence if msg.sender has already voted confidence', async function() {
                await contractInstance.O10VoteConfidence(accounts[1]); // Vote confidence on accounts[1] which should succeed
                await expectRevert(contractInstance.O10VoteConfidence(accounts[1]), 'CerticolDAO: msg.sender has already voted confidence toward target'); // Voting again should failed
            });

            it('should revert vote request if msg.sender did not have O10 authorization', async function() {
                await expectRevert(contractInstance.O10VoteConfidence(accounts[1], { from: accounts[3] }), 'CerticolDAO: msg.sender did not owned a valid O10 authorization'); // Voting from non-O10 should failed
            });

            it('should allow revoke of vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                await contractInstance.O10VoteConfidence(accounts[1]); // Vote confidence on accounts[1] which should succeed
                let tx = await contractInstance.O10RevokeVote(accounts[1]); // Revoke vote of confidence on accounts[1]
                expectEvent.inLogs(tx.logs, 'O10RevokeVoteConfidence', { O10: accounts[0], target: accounts[1], PoSaTUnlocked: vocRequirement }); // Expect O10RevokeVoteConfidence event
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement)); // Expect available credits to drop by O10 requirement only (VoC requirement unlocked)
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement); // Expect only O10 requirement to be locked (VoC requirement unlocked)
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expect 0 active vote of confidence
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[0])).to.be.false; // Expect accounts[0] to no longer endorse accounts[1] in VoC record
                expect(await contractInstance.getVoC(accounts[1])).to.include.members([ constants.ZERO_ADDRESS ]); // Expect 1 zero address in reverse VoC record for accounts[1]
            });

            it('should allow 2 vote of confidence and revoke the first vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                await contractInstance.delegatePoSaT(accounts[2], O10Requirement.add(new BN(vocRequirement)), { from: accounts[0] }); // Delegate enough PoSaT credits to accounts[2] for O10 authorization and 1 vote
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[0] }); // Vote confidence on accounts[1] from accounts[0] which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[2] }); // Vote confidence on accounts[1] from accounts[2] which should succeed
                let tx = await contractInstance.O10RevokeVote(accounts[1], { from: accounts[0] }); // Revoke vote of confidence on accounts[1] from accounts[0]
                expectEvent.inLogs(tx.logs, 'O10RevokeVoteConfidence', { O10: accounts[0], target: accounts[1], PoSaTUnlocked: vocRequirement }); // Expect O10RevokeVoteConfidence event
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement).sub(O10Requirement).sub(vocRequirement)); // Expect available credits to drop by O10 requirement only (VoC requirement unlocked), and another O10 requirement and VoC requirement locked due to delegation, in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[2])).to.be.bignumber.equal(new BN(0)); // Expect 0 available credits in accounts[2]
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement); // Expect only O10 requirement to be locked (VoC requirement unlocked) in accounts[0]
                expect(await contractInstance.getLockedPoSaT(accounts[2])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expect O10 requirement and VoC requirement to be locked in accounts[2]
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expect 0 active vote of confidence in accounts[0]
                expect(await contractInstance.getActiveVoCIssued(accounts[2])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote of confidence in accounts[2]
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[0])).to.be.false; // Expect accounts[0] to no longer endorse accounts[1] in VoC record
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[2])).to.be.true; // Expect accounts[2] to continue to endorse accounts[1] in VoC record
                expect(await contractInstance.getVoC(accounts[1])).to.include.members([ constants.ZERO_ADDRESS, accounts[2] ]); // Expect accounts[2] and address(0) in reverse VoC record for accounts[1]
            });

            it('should allow 2 vote of confidence and revoke the second vote of confidence', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                await contractInstance.delegatePoSaT(accounts[2], O10Requirement.add(new BN(vocRequirement)), { from: accounts[0] }); // Delegate enough PoSaT credits to accounts[2] for O10 authorization and 1 vote
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[0] }); // Vote confidence on accounts[1] from accounts[0] which should succeed
                await contractInstance.O10VoteConfidence(accounts[1], { from: accounts[2] }); // Vote confidence on accounts[1] from accounts[2] which should succeed
                let tx = await contractInstance.O10RevokeVote(accounts[1], { from: accounts[2] }); // Revoke vote of confidence on accounts[1] from accounts[2]
                expectEvent.inLogs(tx.logs, 'O10RevokeVoteConfidence', { O10: accounts[2], target: accounts[1], PoSaTUnlocked: vocRequirement }); // Expect O10RevokeVoteConfidence event
                expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(TOKEN_LOCKED.sub(O10Requirement).sub(vocRequirement).sub(O10Requirement).sub(vocRequirement)); // Expect available credits to drop by O10 requirement and VoC requirement, and another O10 requirement and VoC requirement locked due to delegation, in accounts[0]
                expect(await contractInstance.getAvailablePoSaT(accounts[2])).to.be.bignumber.equal(vocRequirement); // Expect vocRequirement available credits in accounts[2] since it is now unlocked
                expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(O10Requirement.add(vocRequirement)); // Expect O10 requirement and VoC requirement to be locked in accounts[0]
                expect(await contractInstance.getLockedPoSaT(accounts[2])).to.be.bignumber.equal(O10Requirement); // Expect only O10 requirement to be locked (VoC requirement unlocked) in accounts[2]
                expect(await contractInstance.getActiveVoCIssued(accounts[0])).to.be.bignumber.equal(new BN(1)); // Expect 1 active vote of confidence in accounts[0]
                expect(await contractInstance.getActiveVoCIssued(accounts[2])).to.be.bignumber.equal(new BN(0)); // Expect 0 active vote of confidence in accounts[2]
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[0])).to.be.true; // Expect accounts[0] to continue to endorse endorse accounts[1] in VoC record
                expect(await contractInstance.getVoCFrom(accounts[1], accounts[2])).to.be.false; // Expect accounts[2] to no longer endorse accounts[1] in VoC record
                expect(await contractInstance.getVoC(accounts[1])).to.include.members([ accounts[0], constants.ZERO_ADDRESS ]); // Expect accounts[0] and address(0) in reverse VoC record for accounts[1]
            });

            it('should revert if msg.sender has not voted confidence', async function() {
                await expectRevert(contractInstance.O10RevokeVote(accounts[1]), 'CerticolDAO: msg.sender has not voted confidence toward target'); // Failed since accounts[0] have not voted confidence
            });

            it('should revert if msg.sender did not have O10 authorization', async function() {
                await expectRevert(contractInstance.O10RevokeVote(accounts[1], { from: accounts[2] }), 'CerticolDAO: msg.sender did not owned a valid O10 authorization'); // Failed since accounts[2] did not have O10 authorization in this test
            });

        });

        describe('PoSaT Reward', function() {

            // Deploy the contract before each test
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, TOKEN_LOCKED, { from: accounts[0] }); // 66% tokens is locked from accounts[0] into the contract
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature to modify PoSaT requirement
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 10; // Target new PoSaT requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyPoSaTRequirement command
                let signature = await sign(fnSignature, newPoSaTRequirement, blockNumber, oneTimeSeed);
                // Send the transaction to modify the PoSaT block requirement
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                );
                await contractInstance.O10Authorization({ from: accounts[0] }); // Obtain O10 authorization which should succeed
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[0] }); // Vote confidence on addressValid
            });

            it('should give out a single PoSaT rewards', async function() {
                await obtainRingII(caInstance); // Obtain ring II validation for addressValid
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                let blockRequirement = await contractInstance.getCurrentPoSaTRequirement(); // Get current PoSaT block requirement
                let interestRate = await contractInstance.getCurrentPoSaTReward(); // Get current PoSaT interest rate
                // Spam blockRequirement blocks to satisfy PoSaT block requirement
                for (i=0; i<blockRequirement; i++) {
                    await time.advanceBlock();
                }
                let tx = await contractInstance.O10GetReward(addressValid, { from: accounts[0] }); // Expect O10 reward to be given
                expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(TOKEN_LOCKED).add(vocRequirement.mul(interestRate).div(new BN(100)))); // Expect balance of accounts[0] to increase by vocRequirement * interestRate %
                expectEvent.inLogs(tx.logs, 'O10RewardGranted', { O10: accounts[0], reward: vocRequirement.mul(interestRate).div(new BN(100)) }); // Expect O10RewardGranted event
            });

            it('should give out multuple PoSaT reward if multiple PoSaT block requirement has passed', async function() {
                await obtainRingII(caInstance); // Obtain ring II validation for addressValid
                let vocRequirement = await contractInstance.getVOCRequirement(); // Get vote of confidence requirement
                let blockRequirement = await contractInstance.getCurrentPoSaTRequirement(); // Get current PoSaT block requirement
                let interestRate = await contractInstance.getCurrentPoSaTReward(); // Get current PoSaT interest rate
                // Spam 30 blocks to satisfy 3x PoSaT block requirement
                for (i=0; i<3*blockRequirement; i++) {
                    await time.advanceBlock();
                }
                let tx = await contractInstance.O10GetReward(addressValid, { from: accounts[0] }); // Expect first O10 reward to be given
                expectEvent.inLogs(tx.logs, 'O10RewardGranted', { O10: accounts[0], reward: vocRequirement.mul(interestRate).div(new BN(100)) }); // Expect O10RewardGranted event
                tx = await contractInstance.O10GetReward(addressValid, { from: accounts[0] }); // Expect second O10 reward to be given
                expectEvent.inLogs(tx.logs, 'O10RewardGranted', { O10: accounts[0], reward: vocRequirement.mul(interestRate).div(new BN(100)) }); // Expect O10RewardGranted event
                tx = await contractInstance.O10GetReward(addressValid, { from: accounts[0] }); // Expect third O10 reward to be given
                expectEvent.inLogs(tx.logs, 'O10RewardGranted', { O10: accounts[0], reward: vocRequirement.mul(interestRate).div(new BN(100)) }); // Expect O10RewardGranted event
                expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(TOKEN_LOCKED).add(vocRequirement.mul(interestRate).div(new BN(100)).mul(new BN(3)))); // Expect balance of accounts[0] to increase by 3 * vocRequirement * interestRate %
            });

            it('should revert if target\'s ring 2 validation has not lasted for PoSaT block requirement', async function() {
                let blockRequirement = await contractInstance.getCurrentPoSaTRequirement(); // Get current PoSaT block requirement
                // Spam blockRequirement blocks to satisfy PoSaT block requirement
                for (i=0; i<blockRequirement; i++) {
                    await time.advanceBlock();
                }
                await obtainRingII(caInstance); // Obtain ring II validation for addressValid
                // Spam blockRequirement - 2 blocks after ring II validation for addressValid to just NOT satisfy the demand
                for (i=0; i<blockRequirement-2; i++) {
                    await time.advanceBlock();
                }
                await expectRevert(contractInstance.O10GetReward(addressValid, { from: accounts[0] }), 'CerticolDAO: ring 2 status has not sustained long enough for reward'); // Expect revert since ring II validaiton has not lasted long enough
            });

            it('should revert if target\'s ring 2 validation has expired', async function() {
                await obtainRingII(caInstance); // Obtain ring II validation for addressValid
                let ringIIExpiration = await caInstance.getRingTwoValidityPeriod(); // Get ring II expiration block
                // Spam ringIIExpiration blocks to satisfy PoSaT block requirement, but expire ring II status
                for (i=0; i<ringIIExpiration; i++) {
                    await time.advanceBlock();
                }
                await expectRevert(contractInstance.O10GetReward(addressValid, { from: accounts[0] }), 'CerticolDAO: target has no ring 2 status'); // Expect revert since ring II validaiton has expired
            });

            it('should revert if vote of confidence has not lasted for a minimum of PoSaT block requirement', async function() {
                let blockRequirement = await contractInstance.getCurrentPoSaTRequirement(); // Get current PoSaT block requirement
                // Spam blockRequirement - 2 blocks to just not satisfy PoSaT block requirement
                for (i=0; i<blockRequirement-2; i++) {
                    await time.advanceBlock();
                }
                await expectRevert(contractInstance.O10GetReward(addressValid, { from: accounts[0] }), 'CerticolDAO: vote of confidence has not sustained long enough for reward'); // Expect revert since vote of confidence has not lasted enough
            });

            it('should revert if msg.sender has not voted confidence toward target', async function() {
                let O10Requirement = await contractInstance.getO10Requirements(); // Get O10 requirement
                await contractInstance.delegatePoSaT(accounts[2], O10Requirement.add(new BN(1))); // Delegate enough PoSaT credits to accounts[2] for O10 authorization
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization for accounts[2] which should succeed
                await expectRevert(contractInstance.O10GetReward(addressValid, { from: accounts[2] }), 'CerticolDAO: msg.sender has not voted confidence toward target'); // Expect revert since accounts[2] did not vote
            });

            it('should revert if msg.sender did not have O10 authorization', async function() {
                await expectRevert(contractInstance.O10GetReward(addressValid, { from: accounts[2] }), 'CerticolDAO: msg.sender did not owned a valid O10 authorization'); // Expect revert since accounts[2] did not vote
            });

        });

        describe('Ring I validation', function() {

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 25% of all PoSaT credits (or 15% of all tokens), a total of 60% total tokens in total
            // accounts[2] has specificially 25% of all PoSaT credits - 1 for testing purposes
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegatePoSaT(accounts[2], INITIAL_SUPPLY.mul(new BN(15)).div(new BN(100)).sub(new BN(1)), { from: accounts[0] }); // Delegate 25% - 1 PoSaT credits (25% * 60% = 15% of initial supply) to accounts[2]
                await contractInstance.delegatePoSaT(accounts[3], INITIAL_SUPPLY.mul(new BN(15)).div(new BN(100)), { from: accounts[0] }); // Delegate 25% PoSaT credits (25% * 60% = 15% of initial supply) to accounts[3]
                await contractInstance.delegatePoSaT(accounts[4], INITIAL_SUPPLY.mul(new BN(15)).div(new BN(100)), { from: accounts[0] }); // Delegate 25% PoSaT credits (25% * 60% = 15% of initial supply) to accounts[4]
                await contractInstance.delegatePoSaT(accounts[5], INITIAL_SUPPLY.mul(new BN(15)).div(new BN(100)), { from: accounts[0] }); // Delegate 25% PoSaT credits (25% * 60% = 15% of initial supply) to accounts[5]
                await contractInstance.O10Authorization({ from: accounts[2] }); // Obtain O10 authorization for accounts[2] which should succeed
                await contractInstance.O10Authorization({ from: accounts[3] }); // Obtain O10 authorization for accounts[3] which should succeed
                await contractInstance.O10Authorization({ from: accounts[4] }); // Obtain O10 authorization for accounts[4] which should succeed
                await contractInstance.O10Authorization({ from: accounts[5] }); // Obtain O10 authorization for accounts[5] which should succeed
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature to modify PoSaT requirement
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 10; // Target new PoSaT requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyPoSaTRequirement command
                let signature = await sign(fnSignature, newPoSaTRequirement, blockNumber, oneTimeSeed);
                // Send the transaction
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                );
            });

            it('should default to ring 2 status without PoSaT vote', async function() {
                await obtainRingII(caInstance); // Obtain ring 2 status for addressValid
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(2)); // Expect ring 2 after CerticolCA validation
            });

            it('should default to ring 2 status with PoSaT vote but cumulative credit held did not qualify for ring 1 status', async function() {
                await obtainRingII(caInstance); // Obtain ring 2 status for addressValid
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[2] }); // Vote confidence from accounts[2]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(2)); // Expect ring 2 after 25% - 1 credits endorsement
            });

            it('should grant ring 1 status when cumulative credit held qualify for ring 1 status', async function() {
                await obtainRingII(caInstance); // Obtain ring 2 status for addressValid
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[2] }); // Vote confidence from accounts[2]
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[3] }); // Vote confidence from accounts[3]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(1)); // Expect ring 1 after 50% - 1 credits endorsement
            });

            it('should process revoke vote correctly', async function() {
                await obtainRingII(caInstance); // Obtain ring 2 status for addressValid
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[2] }); // Vote confidence from accounts[2]
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[3] }); // Vote confidence from accounts[3]
                await contractInstance.O10RevokeVote(addressValid, { from: accounts[3] }); // Revoke vote from accounts[3]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(2)); // Expect ring 2 after only 25% - 1 credits endorsement
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[4] }); // Vote confidence from accounts[4]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(1)); // Expect ring 1 after 50% - 1 credits endorsement
                await contractInstance.O10RevokeVote(addressValid, { from: accounts[2] }); // Revoke vote from accounts[2]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(1)); // Expect ring 1 after 25% credits endorsement
            });

        });

    });

    describe('O5 Mechanics', function() {

        // Initial supply for CDT token
        const INITIAL_SUPPLY = new BN("90000000" + "0".repeat(18));

        // Function to extract v, r, s value from a signature
        // Copied from https://github.com/ethereum/web3.js/blob/2.x/packages/web3-utils/src/Utils.js
        var getSignatureParameters = function(signature) {
            const r = signature.slice(0, 66);
            const s = `0x${signature.slice(66, 130)}`;
            let v = `0x${signature.slice(130, 132)}`;
            v = web3.utils.hexToNumber(v);
            if (![27, 28].includes(v)) v += 27;
            return {
                r,
                s,
                v
            };
        };
        // Function for signing O5 command and return a signature
        var sign = async function(fnSignature, amendedValue, blockNumber, oneTimeSeed) {
            // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
            let hash = web3.utils.soliditySha3(
                {type: 'string', value: fnSignature},
                {type: 'uint256', value: amendedValue},
                {type: 'uint256', value: blockNumber},
                {type: 'uint256', value: oneTimeSeed}
            );
            return getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
        }

        describe('O5 Authorization mechanics', function() {

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 12.5% of all voting rights (or 15% of all tokens), a total of 60% total tokens in total
            // Note: accounts[2] has specificially 12.5% of all voting rights - 1 for testing purposes
            // In addition, accounts[6] owns 50% of all voting rights
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegateVotingRights(accounts[2], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)).sub(new BN(1)), { from: accounts[0] }); // Delegate 12.5% - 1 voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[2]
                await contractInstance.delegateVotingRights(accounts[3], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[3]
                await contractInstance.delegateVotingRights(accounts[4], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[4]
                await contractInstance.delegateVotingRights(accounts[5], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[5]
                await contractInstance.delegateVotingRights(accounts[6], INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100)), { from: accounts[0] }); // Delegate 50% voting rights (50% * 60% = 30% of initial supply) to accounts[6]
            });

            it('should allow O5 authorization', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                );
                // Expect O5Authorized event
                expectEvent.inLogs(tx.logs, 'O5Authorized', { 
                    functionSignatureIndex: web3.utils.soliditySha3({type: 'string', value: fnSignature}),
                    functionSignature: fnSignature,
                    cumulativeVote: INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100))
                });
                let O5AuthorizedEvents = tx.logs.filter(e => e.event === 'O5Authorized');
                expect(O5AuthorizedEvents[0].args.O5).to.have.ordered.members([ accounts[6], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS ]);
                expect(await contractInstance.getSeedUsed(oneTimeSeed)).to.be.true; // Expect one time seed to be used now
            });

            it('should allow O5 authorization from up to 5 signatures', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                // Array storing signature components
                v = [];
                r = [];
                s = [];
                // Sign using accounts[2] - accounts[6]
                for (i=2; i<7; i++) {
                    let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[i])); // Sign the message using accounts[i]
                    v.push(signature.v); // Extract v, r, s components
                    r.push(signature.r);
                    s.push(signature.s);
                }
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    v, r, s,
                    fnSignature, newPoSaTRequirement
                );
                // Expect O5Authorized event
                expectEvent.inLogs(tx.logs, 'O5Authorized', { 
                    functionSignatureIndex: web3.utils.soliditySha3({type: 'string', value: fnSignature}),
                    functionSignature: fnSignature,
                    cumulativeVote: INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)).sub(new BN(1))
                });
                let O5AuthorizedEvents = tx.logs.filter(e => e.event === 'O5Authorized');
                expect(O5AuthorizedEvents[0].args.O5).to.have.ordered.members([ accounts[2], accounts[3], accounts[4], accounts[5], accounts[6] ]);
                expect(await contractInstance.getSeedUsed(oneTimeSeed)).to.be.true; // Expect one time seed to be used now
            });

            it('should revert O5 authorization if cumulative voting rights did not exceeds 50% of total voting rights', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                // Array storing signature components
                v = [];
                r = [];
                s = [];
                // Sign using accounts[2] - accounts[5]
                for (i=2; i<6; i++) {
                    let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[i])); // Sign the message using accounts[i]
                    v.push(signature.v); // Extract v, r, s components
                    r.push(signature.r);
                    s.push(signature.s);
                }
                v.push(0);
                r.push('0x');
                s.push('0x');
                // Expect revert since only 50% - 1 token has signed it
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    v, r, s,
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getSeedUsed(oneTimeSeed)).to.be.false; // Expect one time seed to still be not used now
            });

            it('should revert if one-time seed is reused', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Send the transaction which should succeed
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                );
                // Sending it again should failed
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: the seed was already used');
            });

            it('should revert if signature has expired', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber(); // Signature effective until current block so should expired immediately
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Sending an expired signature should failed
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: signature has expired');
            });

            it('should revert if mismatched effectiveBlock was sent in the transaction', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Sending a mismatched blockNumber which should failed
                const mismatchedBlockNumber = blockNumber + 100;
                await expectRevert(contractInstance.O5Command(
                    mismatchedBlockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
            });

            it('should revert if mismatched amendedValue was sent in the transaction', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Sending a mismatched newPoSaTRequirement which should failed
                const mismatchedPoSaTRequirement = 200;
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, mismatchedPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
            });

            it('should revert if mismatched oneTimeSeed was sent in the transaction', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using accounts[6] and extract v, r, s components
                // Sending a mismatched oneTimeSeed which should failed
                const mismatchSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                await expectRevert(contractInstance.O5Command(
                    blockNumber, mismatchSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
            });

            it('should revert if cumulative voting rights did not exceeds 50% of total voting rights after exlcuding double-count signatures from the same address', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                // Array storing signature components
                v = [];
                r = [];
                s = [];
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[2])); // Sign the message using only accounts[2]
                // Reuse the same signature 5 times
                for (i=0; i<5; i++) {
                    v.push(signature.v);
                    r.push(signature.r);
                    s.push(signature.s);
                }
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    v, r, s,
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
            });

            it('should allow O5 authorization if cumulative voting rights exceeds 50% of total voting rights after exlcuding double-count signatures from the same address', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature of O5ModifyPoSaTRequirement, we are using this for testing
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement to be 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
                // Generate the message expected by the O5 function - keccak256(fnSignature, amendedValue, blockNumber, oneTimeSeed)
                let hash = web3.utils.soliditySha3(
                    {type: 'string', value: fnSignature},
                    {type: 'uint256', value: newPoSaTRequirement},
                    {type: 'uint256', value: blockNumber},
                    {type: 'uint256', value: oneTimeSeed}
                );
                // Array storing signature components
                v = [];
                r = [];
                s = [];
                let signature = getSignatureParameters(await web3.eth.sign(hash, accounts[6])); // Sign the message using only accounts[6]
                // Reuse the same signature 5 times
                for (i=0; i<5; i++) {
                    v.push(signature.v);
                    r.push(signature.r);
                    s.push(signature.s);
                }
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    v, r, s,
                    fnSignature, newPoSaTRequirement
                );
                // Expect O5Authorized event
                expectEvent.inLogs(tx.logs, 'O5Authorized', { 
                    functionSignatureIndex: web3.utils.soliditySha3({type: 'string', value: fnSignature}),
                    functionSignature: fnSignature,
                    cumulativeVote: INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100))
                });
                let O5AuthorizedEvents = tx.logs.filter(e => e.event === 'O5Authorized');
                expect(O5AuthorizedEvents[0].args.O5).to.have.ordered.members([ accounts[6], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS ]);
                expect(await contractInstance.getSeedUsed(oneTimeSeed)).to.be.true; // Expect one time seed to be used now
            });

        });

        describe('O5 Modify Commands', function() {

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 12.5% of all voting rights (or 15% of all tokens), a total of 60% total tokens in total
            // Note: accounts[2] has specificially 12.5% of all voting rights - 1 for testing purposes
            // In addition, accounts[6] owns 50% of all voting rights
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegateVotingRights(accounts[2], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)).sub(new BN(1)), { from: accounts[0] }); // Delegate 12.5% - 1 voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[2]
                await contractInstance.delegateVotingRights(accounts[3], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[3]
                await contractInstance.delegateVotingRights(accounts[4], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[4]
                await contractInstance.delegateVotingRights(accounts[5], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[5]
                await contractInstance.delegateVotingRights(accounts[6], INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100)), { from: accounts[0] }); // Delegate 50% voting rights (50% * 60% = 30% of initial supply) to accounts[6]
            });

            it('should allow O5 to modify ring one requirement', async function() {
                const fnSignature = 'O5ModifyRingOneRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newRingOneRequirement = 10; // Target new ring one requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyRingOneRequirement command
                let signature = await sign(fnSignature, newRingOneRequirement, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newRingOneRequirement
                );
                // Expect O5AmendRingOneRequirement event
                expectEvent.inLogs(tx.logs, 'O5AmendRingOneRequirement', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber()),
                    amended: new BN(newRingOneRequirement) 
                });
                expect(await contractInstance.getCurrentRingOneRequirement()).to.be.bignumber.equal(new BN(newRingOneRequirement)); // Expect ring one requirement to be modified to newRingOneRequirement
            });

            it('should revert if non-O5 try to modify ring one requirement', async function() {
                const fnSignature = 'O5ModifyRingOneRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newRingOneRequirement = 10; // Target new ring one requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, newRingOneRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getCurrentRingOneRequirement()).to.be.bignumber.not.equal(new BN(newRingOneRequirement)); // Expect ring one requirement to be unchanged
            });

            it('should allow O5 to modify PoSaT requirement', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyPoSaTRequirement command
                let signature = await sign(fnSignature, newPoSaTRequirement, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                );
                // Expect O5AmendPoSaTRewardRequirement event
                expectEvent.inLogs(tx.logs, 'O5AmendPoSaTRewardRequirement', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber()),
                    amended: new BN(newPoSaTRequirement) 
                });
                expect(await contractInstance.getCurrentPoSaTRequirement()).to.be.bignumber.equal(new BN(newPoSaTRequirement)); // Expect PoSaT requirement to be modified to newPoSaTRequirement
            });

            it('should revert if non-O5 try to modify PoSaT requirement', async function() {
                const fnSignature = 'O5ModifyPoSaTRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTRequirement = 100; // Target new PoSaT requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTRequirement
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getCurrentPoSaTRequirement()).to.be.bignumber.not.equal(new BN(newPoSaTRequirement)); // Expect PoSaT requirement to be unchanged
            });

            it('should allow O5 to modify PoSaT reward', async function() {
                const fnSignature = 'O5ModifyPoSaTReward'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTReward = 10; // Target new PoSaT reward
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyPoSaTReward command
                let signature = await sign(fnSignature, newPoSaTReward, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTReward
                );
                // Expect O5AmendPoSaTReward event
                expectEvent.inLogs(tx.logs, 'O5AmendPoSaTReward', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber()),
                    amended: new BN(newPoSaTReward) 
                });
                expect(await contractInstance.getCurrentPoSaTReward()).to.be.bignumber.equal(new BN(newPoSaTReward)); // Expect PoSaT reward to be modified to newPoSaTReward
            });

            it('should revert if non-O5 try to modify PoSaT reward', async function() {
                const fnSignature = 'O5ModifyPoSaTReward'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newPoSaTReward = 100; // Target new PoSaT reward
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, newPoSaTReward
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getCurrentPoSaTReward()).to.be.bignumber.not.equal(new BN(newPoSaTReward)); // Expect PoSaT reward to be unchanged
            });

            it('should allow O5 to modify vote of confidence requirement', async function() {
                const fnSignature = 'O5ModifyVoCRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newVoCReward = 100000; // Target new vote of confidence requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyVoCRequirement command
                let signature = await sign(fnSignature, newVoCReward, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newVoCReward
                );
                // Expect O5AmendVoCRequirement event
                expectEvent.inLogs(tx.logs, 'O5AmendVoCRequirement', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber()),
                    amended: new BN(newVoCReward) 
                });
                expect(await contractInstance.getVOCRequirement()).to.be.bignumber.equal(new BN(newVoCReward)); // Expect vote of confidence requirement to be modified to newVoCReward
            });

            it('should revert if non-O5 try to modify vote of confidence requirement', async function() {
                const fnSignature = 'O5ModifyVoCRequirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newVoCReward = 100000; // Target new vote of confidence requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, newVoCReward
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getVOCRequirement()).to.be.bignumber.not.equal(new BN(newVoCReward)); // Expect vote of confidence requirement to be unchanged
            });

            it('should allow O5 to modify O10 requirement', async function() {
                const fnSignature = 'O5ModifyO10Requirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newO10Reward = INITIAL_SUPPLY.div(new BN(2)); // Target new O10 requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5ModifyO10Requirement command
                let signature = await sign(fnSignature, newO10Reward, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, newO10Reward
                );
                // Expect O5AmendVoCRequirement event
                expectEvent.inLogs(tx.logs, 'O5AmendO10Requirement', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber()),
                    amended: new BN(newO10Reward) 
                });
                expect(await contractInstance.getO10Requirements()).to.be.bignumber.equal(new BN(newO10Reward)); // Expect O10 requirement to be modified to newO10Reward
            });

            it('should revert if non-O5 try to modify O10 requirement', async function() {
                const fnSignature = 'O5ModifyO10Requirement'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const newO10Reward = INITIAL_SUPPLY.div(new BN(2)); // Target new O10 requirement
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, newO10Reward
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getO10Requirements()).to.be.bignumber.not.equal(new BN(newO10Reward)); // Expect O10 requirement to be unchanged
            });

            it('should nothing happen if function signature is not recognized', async function() {
                const fnSignature = 'DOES-NOT-EXIST-FUNCTION'; // Invalid function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = 0; // Random new value
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the invalid command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Nothing should happened since the function signature is not recognized
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                )
                expect(tx.logs.length).to.equal(1); // Expect only 1 O5Authorized event and nothing else
            });

        });

        describe('O5 Dissolve Command', function() {

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 12.5% of all voting rights (or 15% of all tokens), a total of 60% total tokens in total
            // Note: accounts[2] has specificially 12.5% of all voting rights - 1 for testing purposes
            // In addition, accounts[6] owns 50% of all voting rights
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegateVotingRights(accounts[2], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)).sub(new BN(1)), { from: accounts[0] }); // Delegate 12.5% - 1 voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[2]
                await contractInstance.delegateVotingRights(accounts[3], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[3]
                await contractInstance.delegateVotingRights(accounts[4], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[4]
                await contractInstance.delegateVotingRights(accounts[5], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[5]
                await contractInstance.delegateVotingRights(accounts[6], INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100)), { from: accounts[0] }); // Delegate 50% voting rights (50% * 60% = 30% of initial supply) to accounts[6]
            });

            it('should allow O5 to dissolve DAO', async function() {
                const fnSignature = 'O5DissolveDAO'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = 0; // O5DissolveDAO function expects 0 as amendedValue
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5DissolveDAO command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                );
                // Expect O5DissolvedDAO event
                expectEvent.inLogs(tx.logs, 'O5DissolvedDAO', { 
                    effectiveFrom: new BN(await web3.eth.getBlockNumber())
                });
                expect(await tokenInstance.owner()).to.have.string(accounts[0]); // Expect ownership of CerticolDAOToken to be transferred to msg.sender
                expect(await contractInstance.getDAODissolved()).to.be.true; // Expect DAO to be dissolved after this operation
            });

            it('should revert if non-O5 try dissolve DAO', async function() {
                const fnSignature = 'O5DissolveDAO'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Expect to fail since there are not enough supporting votes
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, 0

                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await tokenInstance.owner()).to.have.string(contractInstance.address); // Expect ownership of CerticolDAOToken to remain unchanged (CerticolDAO contract)
                expect(await contractInstance.getDAODissolved()).to.be.false; // Expect DAO to NOT be dissolved after this operation
            });

            it('should allow dissolveWithdrawl call when DAO is dissolved', async function() {
                const fnSignature = 'O5DissolveDAO'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = 0; // O5DissolveDAO function expects 0 as amendedValue
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5DissolveDAO command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Send the transaction and dissolve the DAO
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                );
                // Withdraw all locked tokens from accounts[0] which has deposited 60% of initial supply in beforeEach
                let tx = await contractInstance.dissolveWithdrawl({ from: accounts[0] });
                expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY); // Expect all locked token should be returned to accounts[0], even if voting rights is delegated away currently
                expectEvent.inLogs(tx.logs, 'TokensUnlocked', { tokenHolder: accounts[0], amount: INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)) }); // Expect 60% of initial supply to be unlocked in TokensUnlocked event
                expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(new BN(0)); // Expected a total of 0 token locked in the contract now
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expect 0 token locked in contract from accounts[0] now
            });

            it('should revert dissolveWithdrawl call when DAO is not dissolved', async function() {
                await expectRevert(contractInstance.dissolveWithdrawl({ from: accounts[0] }), 'CerticolDAO: this function is only available if O5 has dissolved this DAO'); // Expect fail since DAO is NOT dissolved
                expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.mul(new BN(40)).div(new BN(100))); // Expect balance of accounts[0] to remain the same (40% of initial supply)
                expect(await contractInstance.getCumulativeTokenLocked()).to.be.bignumber.equal(INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100))); // Expected a total of 60% token still locked in the contract
                expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100))); // Expect 60% token still locked in contract from accounts[0]
            });

        });

        describe('Post O5-Dissolve Function Blocker', function() {

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 12.5% of all voting rights (or 15% of all tokens), a total of 60% total tokens in total
            // Note: accounts[2] has specificially 12.5% of all voting rights - 1 for testing purposes
            // In addition, accounts[6] owns 50% of all voting rights, and accounts[0] owns valid O10 authorization
            // Finally, the DAO is dissolved by accounts[6]
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegateVotingRights(accounts[2], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)).sub(new BN(1)), { from: accounts[0] }); // Delegate 12.5% - 1 voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[2]
                await contractInstance.delegateVotingRights(accounts[3], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[3]
                await contractInstance.delegateVotingRights(accounts[4], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[4]
                await contractInstance.delegateVotingRights(accounts[5], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[5]
                await contractInstance.delegateVotingRights(accounts[6], INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100)), { from: accounts[0] }); // Delegate 50% voting rights (50% * 60% = 30% of initial supply) to accounts[6]
                await contractInstance.O10Authorization({ from: accounts[0] }); // Gain valid O10 authorization for accounts[0]
                const fnSignature = 'O5DissolveDAO'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = 0; // O5DissolveDAO function expects 0 as amendedValue
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5DissolveDAO command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Send the transaction and dissolve the DAO
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                );
            });

            it('should revert token deposit after O5 has dissolved DAO', async function() {
                await expectRevert(tokenInstance.transfer(contractInstance.address, 1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert normal token withdrawl after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.withdrawToken(1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert voting right delegation after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.delegateVotingRights(constants.ZERO_ADDRESS, 1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert withdrawl of voting right delegation after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.withdrawDelegatedVotingRights(accounts[2], 1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert PoSaT credits delegation after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.delegatePoSaT(constants.ZERO_ADDRESS, 1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert withdrawl of PoSaT credits delegation after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.withdrawDelegatedPoSaT(constants.ZERO_ADDRESS, 1), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert O10 authorization call after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.O10Authorization(), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert O10 deauthorization call after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.O10Deauthorization(), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert O10 vote of confidence call after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.O10VoteConfidence(constants.ZERO_ADDRESS), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert O10 get reward call after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.O10GetReward(constants.ZERO_ADDRESS), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

            it('should revert O10 revoke vote of confidence call after O5 has dissolved DAO', async function() {
                await expectRevert(contractInstance.O10RevokeVote(constants.ZERO_ADDRESS), 'CerticolDAO: this function is no longer available since O5 has dissolved this DAO');
            });

        });

        describe('O5 Vote of No Confidence', function() {

            // Storing constant addresses from Provable-Domain for unit testing
            var addressValid = '0x7A490a716f9033E3B3b51aBEAf579B54ecBffd23';
            // Default gas price for Provable callback (10 GWei)
            const GAS_PRICE = '10000000000';
            // Function for obtaining ring 2 validation for addressValid
            var obtainRingII = async function(caInstance) {
                // Set the provider to WebsocketProvider to allow event subscription used in Ring 2 challenge
                let currentHTTPProvider = web3.currentProvider.host;
                caInstance.contract.setProvider(currentHTTPProvider.replace("http", "ws"));
                // Obtain initial ring 2 validation for addressValid
                await caInstance.ringThreeDeclaration(
                    'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                    { from: addressValid }
                );
                await caInstance.ringTwoDeclaration(
                    'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                    { from: addressValid }
                );
                let receipt = await caInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
                let challengeId = receipt.logs[1].args.challengeId;
                let cost = await caInstance.getProvableCost.call(GAS_PRICE);
                await caInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
                await new Promise(function(resolve) {
                    caInstance.contract.events.RingTwoChallengeResult(
                        function(error) {
                            if (error) { revert(error); }
                            resolve();
                        }
                    );
                });
            }
            // Function for voting no confidence using accounts[0] on addressValid
            var voteNoConfidence = async function(contractInstance) {
                const fnSignature = 'O5VoteNoConfidence'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = addressValid; // Vote no confidence on addressValid
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5VoteNoConfidence command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Send the transaction
                await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                );
            }

            // Deploy the contract before each test
            // A total of 60% of token is locked up in the contract
            // Create an environment where accounts 2 - 5 each owns 12.5% of all voting rights (or 15% of all tokens), a total of 60% total tokens in total
            // Note: accounts[2] has specificially 12.5% of all voting rights - 1 for testing purposes
            // In addition, accounts[6] owns 50% of all voting rights, and accounts[0] owns valid O10 authorization
            // Finally, addressValid holds valid ring II validation and was granted ring I validation by accounts[0]
            beforeEach(async function() {
                tokenInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] }); // CDT token contract is deployed first
                caInstance = await CerticolCATest.new({ from: accounts[1] }); // CerticolCA contract for testing, with reduced blocks expiration block for ring 2 validation
                contractInstance = await CerticolDAO.new(tokenInstance.address, caInstance.address); // Deploy DAO contract
                await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
                await tokenInstance.transfer(contractInstance.address, INITIAL_SUPPLY.mul(new BN(60)).div(new BN(100)), { from: accounts[0] }); // 60% tokens is locked from accounts[0] into the contract
                await contractInstance.delegateVotingRights(accounts[2], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)).sub(new BN(1)), { from: accounts[0] }); // Delegate 12.5% - 1 voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[2]
                await contractInstance.delegateVotingRights(accounts[3], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[3]
                await contractInstance.delegateVotingRights(accounts[4], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[4]
                await contractInstance.delegateVotingRights(accounts[5], INITIAL_SUPPLY.mul(new BN(75)).div(new BN(1000)), { from: accounts[0] }); // Delegate 12.5% voting rights (12.5% * 60% = 7.5% of initial supply) to accounts[5]
                await contractInstance.delegateVotingRights(accounts[6], INITIAL_SUPPLY.mul(new BN(30)).div(new BN(100)), { from: accounts[0] }); // Delegate 50% voting rights (50% * 60% = 30% of initial supply) to accounts[6]
                await contractInstance.O10Authorization({ from: accounts[0] }); // Gain valid O10 authorization for accounts[0]
                await obtainRingII(caInstance); // Obtain ring II validation for addressValid
                await contractInstance.O10VoteConfidence(addressValid, { from: accounts[0] }); // Vote confidence from accounts[0]
            });

            it('should allow O5 to issue vote of no confidence', async function() {
                const fnSignature = 'O5VoteNoConfidence'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = addressValid; // Vote no confidence on addressValid
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Sign the O5VoteNoConfidence command
                let signature = await sign(fnSignature, amendedValue, blockNumber, oneTimeSeed);
                // Send the transaction
                let tx = await contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [signature.v, 0, 0, 0, 0],
                    [signature.r, '0x', '0x', '0x', '0x'],
                    [signature.s, '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                );
                // Expect O5VotedNoConfidence event
                expectEvent.inLogs(tx.logs, 'O5VotedNoConfidence', { 
                    target: addressValid
                });
                expect(await contractInstance.getO5VoteNoConfidence(addressValid)).to.be.true; // Expect addressValid to be voted no confidence
            });

            it('should revert if non-O5 try to issue vote of no confidence', async function() {
                const fnSignature = 'O5VoteNoConfidence'; // Function signature
                const blockNumber = await web3.eth.getBlockNumber() + 100; // Signature effective until current block + 100
                const amendedValue = addressValid; // Vote no confidence on addressValid
                const oneTimeSeed = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // Generate one-time seed
                // Send the transaction without signature which should failed
                await expectRevert(contractInstance.O5Command(
                    blockNumber, oneTimeSeed,
                    [0, 0, 0, 0, 0],
                    ['0x', '0x', '0x', '0x', '0x'],
                    ['0x', '0x', '0x', '0x', '0x'],
                    fnSignature, amendedValue
                ), 'CerticolDAO: cumulative voting rights did not exceeds 50% of total voting rights');
                expect(await contractInstance.getO5VoteNoConfidence(addressValid)).to.be.false; // Expect addressValid to NOT be voted no confidence
            });

            it('should revert O10 vote confidence request once target was voted no confidence by O5', async function() {
                await voteNoConfidence(contractInstance); // Vote no confidence using accounts[0]
                await expectRevert(contractInstance.O10VoteConfidence(addressValid), 'CerticolDAO: O5 has voted no confidence toward the target'); // Expect fail after O5 vote of no confidence
            });

            it('should revert O10 get reward request once target was voted no confidence by O5', async function() {
                await voteNoConfidence(contractInstance); // Vote no confidence using accounts[0]
                await expectRevert(contractInstance.O10GetReward(addressValid), 'CerticolDAO: O5 has voted no confidence toward the target'); // Expect fail after O5 vote of no confidence
            });

            it('should revert O10 revoke vote request once target was voted no confidence by O5', async function() {
                await voteNoConfidence(contractInstance); // Vote no confidence using accounts[0]
                await expectRevert(contractInstance.O10RevokeVote(addressValid), 'CerticolDAO: O5 has voted no confidence toward the target'); // Expect fail after O5 vote of no confidence
            });

            it('should return ring 4 status regardless of prior validation status once target was voted no confidence by O5', async function() {
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(1)); // Expect ring 1 status originally
                await voteNoConfidence(contractInstance); // Vote no confidence using accounts[0]
                expect(await contractInstance.getCurrentRing(addressValid)).to.be.bignumber.equal(new BN(4)); // Expect ring 4 status afterward
            });

        });

    });

});