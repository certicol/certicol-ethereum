// Import library function
const { singletons, BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
const CerticolCA = artifacts.require('CerticolCA');
const CerticolCATest = artifacts.require('CerticolCATest');
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
            await expectRevert(fakeTokenInstance.transfer(contractInstance.address, 100, { from: accounts[1] }), 'CDAO: we only accept CDT token');
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
                await expectRevert(contractInstance.delegateVotingRights(accounts[1], 51, { from: accounts[0] }), 'CDAO: insufficient voting rights or secondary delegation is not permitted');
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
                await expectRevert(contractInstance.delegateVotingRights(accounts[2], 25, { from: accounts[1] }), 'CDAO: insufficient voting rights or secondary delegation is not permitted');
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
                await expectRevert(contractInstance.delegatePoSaT(accounts[1], 51, { from: accounts[0] }), 'CDAO: insufficient PoSaT credits or secondary delegation is not permitted');
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
                await expectRevert(contractInstance.delegatePoSaT(accounts[2], 25, { from: accounts[1] }), 'CDAO: insufficient PoSaT credits or secondary delegation is not permitted');
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
                await contractInstance.tempBackdoor({ from: accounts[0] }); // Use backdoor to modify PoSaT block requirement to 10, will be replaced later
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
                await contractInstance.tempBackdoor({ from: accounts[0] }); // Use backdoor to modify PoSaT block requirement to 10, will be replaced later
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

});