// Import library function
const { singletons, BN, constants, expectEvent, expectRevert } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
const CerttifyDAO = artifacts.require('CerttifyDAO');
const CerttifyDAOToken = artifacts.require('CerttifyDAOToken');

// Test for CerttifyDAOToken.sol
contract('CerttifyDAO', function(accounts) {

    // Storing instance of deployed DAO contract
    var contractInstance;
    // Storing instance of deployed CTD token
    var tokenInstance;

    // Deploy ERC-1820 before any tests since ERC-777 and the DAO is dependent upon it
    before(async function() {
        // Source: https://github.com/OpenZeppelin/openzeppelin-solidity/issues/1743#issuecomment-491472245
        await singletons.ERC1820Registry(accounts[0]);
    });

    describe('Initialization and Deployment', function() {

        beforeEach(async function() {
            tokenInstance = await CerttifyDAOToken.new(accounts[0], { from: accounts[1] }); // CTD token contract is deployed first
            contractInstance = await CerttifyDAO.new(tokenInstance.address); // Deploy DAO contract
            await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
        });

        it('should own CerttifyDAOToken', async function() {
            expect(await tokenInstance.owner()).to.have.string(contractInstance.address); // Expected DAO to own the CTD contract
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

    });

    describe('Basic Token Lock and Release Mechanics', function() {

        const INITIAL_SUPPLY = new BN("10000000" + "0".repeat(18));

        beforeEach(async function() {
            tokenInstance = await CerttifyDAOToken.new(accounts[0], { from: accounts[1] }); // CTD token contract is deployed first
            contractInstance = await CerttifyDAO.new(tokenInstance.address); // Deploy DAO contract
            await tokenInstance.transferOwnership(contractInstance.address, { from: accounts[1] }); // Transfer ownership to the DAO
        });

        it('should accept token deposit and lock those token', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            let event = await contractInstance.getPastEvents('TokensLocked', { filter: { tokenHolder: accounts[0] } }); // Since TokensLocked event is emitted in another contract, it is not included in the transaction log
            expectEvent.inLogs(event, 'TokensLocked', { tokenHolder: accounts[0], amount: new BN(100) }); // Expected TokensLocked event
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100)); // Expected that DAO contract now owns 100 CTD
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100))); // Expected that accounts[0] has 100 fewer CTD
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 locked tokens
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] now has 100 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
        });

        it('should revert token deposit if deposit more than what they owned', async function() {
            await expectRevert(tokenInstance.transfer(contractInstance.address, 1, { from: accounts[1] }), 'SafeMath: subtraction overflow'); // Transfer and lock 1 tokens to DAO from accounts[1], who owns no token and therefore failed
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(0)); // Expected that DAO contract now owns 0 CTD
            expect(await tokenInstance.balanceOf(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected that accounts[1] still has 0 CTD
            expect(await contractInstance.getTokensLocked(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 locked tokens
            expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has no locked PoSaT credits
        });

        it('should revert token deposit if it is not the designated CTD token', async function() {
            let fakeTokenInstance = await CerttifyDAOToken.new(accounts[1], { from: accounts[1] }); // Fake CTD token contract
            await expectRevert(fakeTokenInstance.transfer(contractInstance.address, 100, { from: accounts[1] }), 'CDAO: we only accept CTD token');
            // Transfer should failed since it is not the recognized CTD token
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(0)); // Expected that DAO contract owns 0 CTD
            expect(await contractInstance.getTokensLocked(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 locked tokens
            expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has 0 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[1])).to.be.bignumber.equal(new BN(0)); // Expected accounts[1] has no locked PoSaT credit
        });

        it('should accept withdrawl of locked tokens and adjust voting rights and PoSaT credit accordingly', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            tx = await contractInstance.withdrawToken(50, { from: accounts[0] }); // Withdraw 50 locked tokens back
            expectEvent.inLogs(tx.logs, 'TokensUnlocked', { tokenHolder: accounts[0], amount: new BN(50) }); // Expected TokensUnlocked event
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected that DAO contract now owns 100 - 50 CTD
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100)).add(new BN(50))); // Expected that accounts[0] has 50 more CTD
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 locked tokens only
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 voting rights only
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100).sub(new BN(50))); // Expected accounts[0] now has 100 - 50 PoSaT credits only
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
        });

        it('should not accept withdrawl of locked tokens if it exceeds the number of tokens they have locked', async function() {
            await tokenInstance.transfer(contractInstance.address, 100, { from: accounts[0] }); // Transfer and lock 100 tokens to DAO from accounts[0]
            await expectRevert(contractInstance.withdrawToken(101, { from: accounts[0] }), 'SafeMath: subtraction overflow'); // Withdraw 101 locked tokens back, which should fail
            expect(await tokenInstance.balanceOf(contractInstance.address)).to.be.bignumber.equal(new BN(100)); // Expected that DAO contract still owns 100 CTD
            expect(await tokenInstance.balanceOf(accounts[0])).to.be.bignumber.equal(INITIAL_SUPPLY.sub(new BN(100))); // Expected that accounts[0] still has 100 fewer CTD
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 locked tokens
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 voting rights
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(100)); // Expected accounts[0] still has 100 PoSaT credits
            expect(await contractInstance.getLockedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected accounts[0] has no locked PoSaT credits
        });

    });

    describe('Voting Rights Delegation Mechanics', function() {

        // Deploy the contract before each test
        beforeEach(async function() {
            tokenInstance = await CerttifyDAOToken.new(accounts[0], { from: accounts[1] }); // CTD token contract is deployed first
            contractInstance = await CerttifyDAO.new(tokenInstance.address); // Deploy DAO contract
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
            await contractInstance.withdrawToken(50, { from: accounts[0] }); // Since accounts[0] only had 50 voting rights, it can withdraw up to 50 CTD, so this should work
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected accounts[0] has 100 - 50 locked tokens only
            expect(await contractInstance.getVotingRights(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 voting rights left in accounts[0]
            expect(await contractInstance.getVotingRights(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 voting rights (delegated from accounts[0]) in accounts[1]
            expect(await contractInstance.getDelegatedVotingRights(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated rights from accounts[0] to accounts[1]
            expect(await contractInstance.getNetDelegatedVotingRights(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated rights from accounts[0]
        });

        it('should not accept the withdrawl of locked tokens if msg.sender does not have sufficient voting rights', async function() {
            await contractInstance.delegateVotingRights(accounts[1], 50, { from: accounts[0] }); // Delegate 50 voting rights to accounts[1]
            await expectRevert(contractInstance.withdrawToken(51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
            // Since accounts[0] only had 50 voting rights, it can only withdraw up to 50 CTD, so this should fail
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
            tokenInstance = await CerttifyDAOToken.new(accounts[0], { from: accounts[1] }); // CTD token contract is deployed first
            contractInstance = await CerttifyDAO.new(tokenInstance.address); // Deploy DAO contract
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
            await contractInstance.withdrawToken(50, { from: accounts[0] }); // Since accounts[0] only had 50 PoSaT credits, it can withdraw up to 50 CTD, so this should work
            expect(await contractInstance.getTokensLocked(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected accounts[0] has 100 - 50 locked tokens only
            expect(await contractInstance.getAvailablePoSaT(accounts[0])).to.be.bignumber.equal(new BN(0)); // Expected 100 - 50 - 50 PoSaT credits left in accounts[0]
            expect(await contractInstance.getAvailablePoSaT(accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 PoSaT credits (delegated from accounts[0]) in accounts[1]
            expect(await contractInstance.getDelegatedPoSaT(accounts[0], accounts[1])).to.be.bignumber.equal(new BN(50)); // Expected 50 delegated PoSaT credits from accounts[0] to accounts[1]
            expect(await contractInstance.getNetDelegatedPoSaT(accounts[0])).to.be.bignumber.equal(new BN(50)); // Expected a net of 50 delegated PoSaT credits from accounts[0]
        });

        it('should not accept the withdrawl of locked tokens if msg.sender does not have sufficient PoSaT credits', async function() {
            await contractInstance.delegatePoSaT(accounts[1], 50, { from: accounts[0] }); // Delegate 50 PoSaT credits to accounts[1]
            await expectRevert(contractInstance.withdrawToken(51, { from: accounts[0] }), 'SafeMath: subtraction overflow');
            // Since accounts[0] only had 50 PoSaT credits, it can only withdraw up to 50 CTD, so this should fail
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