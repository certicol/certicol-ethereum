// Import library function
const { singletons, BN, constants, expectRevert } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
const CerticolDAOToken = artifacts.require('CerticolDAOToken');

// Test for CerticolDAOToken.sol
contract('CerticolDAOToken', function(accounts) {

    // Storing instance of deployed contract
    var contractInstance;

    // Deploy ERC-1820 before any tests since ERC-777 is dependent upon it
    before(async function() {
        // Source: https://github.com/OpenZeppelin/openzeppelin-solidity/issues/1743#issuecomment-491472245
        await singletons.ERC1820Registry(accounts[0]);
    });

    // Deploy the contract before each test
    beforeEach(async function() {
        contractInstance = await CerticolDAOToken.new(accounts[0], { from: accounts[1] });
    });

    it('should not accept address zero as the wallet address', async function() {
        await expectRevert(CerticolDAOToken.new(constants.ZERO_ADDRESS, { from: accounts[1] }), "CDT: initial token send to the zero address");
    });

    it('should create and grant 10,000,000 CDT tokens upon creation', async function() {
        let initialBalance = new BN("10000000" + "0".repeat(18));
        let balance = await contractInstance.balanceOf(accounts[0]);
        expect(balance).to.be.bignumber.equal(initialBalance);
        let totalSupply = await contractInstance.totalSupply();
        expect(totalSupply).to.be.bignumber.equal(initialBalance);
    });

    it('should be owned by deployer before transferring ownership to DAO', async function() {
        let owner = await contractInstance.owner();
        expect(owner).to.have.string(accounts[1]);
    });

    it('should allow transfer of ownerhsip', async function() {
        await contractInstance.transferOwnership(accounts[2], { from: accounts[1] });
        let owner = await contractInstance.owner();
        expect(owner).to.have.string(accounts[2]);
    });

    it('should not accept address zero as new owner address', async function() {
        await expectRevert(contractInstance.transferOwnership(constants.ZERO_ADDRESS, { from: accounts[1] }), "Ownable: new owner is the zero address");
    });

    it('should not allow non-owner to transfer ownership', async function() {
        await expectRevert(contractInstance.transferOwnership(accounts[2], { from: accounts[3] }), "Ownable: caller is not the owner");
    });

    it('tokens can be minted by the owner address', async function() {
        let balance = await contractInstance.balanceOf(accounts[3]);
        expect(balance).to.be.bignumber.equal(new BN(0));
        await contractInstance.transferOwnership(accounts[2], { from: accounts[1] });
        await contractInstance.mintInterest(accounts[3], 100, { from: accounts[2] });
        let updatedBalance = await contractInstance.balanceOf(accounts[3]);
        expect(updatedBalance).to.be.bignumber.equal(new BN(100));
    });

    it('tokens cannnot be minted by other addresses', async function() {
        await contractInstance.transferOwnership(accounts[2], { from: accounts[1] });
        await expectRevert(contractInstance.mintInterest(accounts[3], 100, { from: accounts[0] }), "Ownable: caller is not the owner");
        await expectRevert(contractInstance.mintInterest(accounts[3], 100, { from: accounts[1] }), "Ownable: caller is not the owner");
        let balance = await contractInstance.balanceOf(accounts[3]);
        expect(balance).to.be.bignumber.equal(new BN(0));
    });

})