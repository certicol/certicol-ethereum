// Import library function
const { singletons, expectRevert } = require('openzeppelin-test-helpers');
const { expect } = require('chai');
const fs = require('fs');
const RLP = require('rlp');

// Obtain contract abstractions
const CerticolDAOToken = artifacts.require('CerticolDAOToken');
const CerticolDAOTokenDeployer = artifacts.require('CerticolDAOTokenDeployer');

// Obtain bytecode for Gas Token
const GasTokenBytecode = fs.readFileSync('./test/GasToken.txt', 'UTF-8').toString();
const GasTokenABI = JSON.parse(fs.readFileSync('./test/GasTokenABI.txt', 'UTF-8').toString());

// Test for CerticolDAOTokenDeployer.sol
contract('CerticolDAOTokenDeployer', function(accounts) {

    // Gas cost used to deploy contract, additional gas will be refunded
    var BLOCK_GAS_LIMIT = 6721975;

    // Deployed instance of GST1 contract
    var GasTokenContract;
    // Address of deployed GST1 contract
    var GasTokenAddress;

    // Function for predicting the next contract address before deployment
    var getContractAddress = function(sender, nonce) {
        return '0x' + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    }

    // Deploy GST1 contract and mint 5000 GST1 for accounts[0]
    before(async function() {
        // Deploy ERC-1820 before any tests since ERC-777 is dependent upon it
        await singletons.ERC1820Registry(accounts[0]);
        // Estimate gas cost and deploy GasToken2 contract
        let gasTokenContract = new web3.eth.Contract(GasTokenABI);
        let gasCost = await gasTokenContract.deploy({ data: GasTokenBytecode }).estimateGas();
        GasTokenContract = await gasTokenContract.deploy({ data: GasTokenBytecode }).send({
            from: accounts[0],
            gas: gasCost
        });
        // Record the address of the contract globally
        GasTokenAddress = GasTokenContract.options.address;
        // Mint 5,000 GST1 consecutively
        gasCost = await GasTokenContract.methods.mint(25).estimateGas({ from: accounts[0] });
        for (i=0; i<200; i++) {
            await GasTokenContract.methods.mint(25).send({ from: accounts[0], gas: gasCost });
        }
        // Increase gas limit if on coverage network
        let lastBlock = await web3.eth.getBlock("latest");
        if (await lastBlock.gasLimit == 17592186044415) {
            BLOCK_GAS_LIMIT = 17592186044415;
        }
    });

    it('should predict deployed contract address', async function() {
        let prediction = getContractAddress(accounts[0], await web3.eth.getTransactionCount(accounts[0]));
        let gasTokenContract = new web3.eth.Contract(GasTokenABI);
        let dummyContract = await gasTokenContract.deploy({ data: GasTokenBytecode }).send({
            from: accounts[0],
            gas: 5000000
        });
        expect(dummyContract.options.address.toLowerCase()).to.have.string(prediction);
    });

    it('should deploy CerticolDAOToken.sol with fewer gas', async function() {
        // Predict the contract address once it was deployed
        // Nonce is set as current_nonce + 1 as we need 1 transaction to approve the contract from using the minted token
        let deployAddress = getContractAddress(accounts[0], await web3.eth.getTransactionCount(accounts[0]) + 1);
        // Estimage gas cost for approval call
        let approveGasCost = await GasTokenContract.methods.approve(deployAddress, 172).estimateGas({ from: accounts[0] });
        // Approve the predicted contract address to free up to 172 GST1
        await GasTokenContract.methods.approve(deployAddress, 172).send({ from: accounts[0], gas: approveGasCost });
        // Deploy using CerticolDAOTokenDeployer and obtain the gas used
        let contract = await CerticolDAOTokenDeployer.new(GasTokenAddress, accounts[1], { from: accounts[0], gas: BLOCK_GAS_LIMIT });
        let receipt = await web3.eth.getTransactionReceipt(contract.transactionHash);
        let gasUsed = receipt.cumulativeGasUsed;
        // Estimate the gas cost normally required to deploy CerticolDAOToken directly
        let gasCostExpected = await new web3.eth.Contract(CerticolDAOToken._json.abi)
            .deploy({ data: CerticolDAOToken._json.bytecode, arguments: [ accounts[1] ] })
            .estimateGas();
        // Assert fewer gas was used
        expect(gasUsed).below(gasCostExpected);
        // Predict the address of the deployed CerticolDAOToken contract
        let finalAddress = getContractAddress(deployAddress, 1);
        // Assert the bytecode is deployed there
        let finalAddressBytecode = await web3.eth.getCode(finalAddress);
        expect(finalAddressBytecode).to.have.string(CerticolDAOToken._json.deployedBytecode);
    });

    it('should revert if insufficient GST token is approved to the contract', async function() {
        await expectRevert(
            CerticolDAOTokenDeployer.new(GasTokenAddress, accounts[1], { from: accounts[0], gas: BLOCK_GAS_LIMIT }),
            'CerticolCADeployer: unable to free the pre-defined GST1'
        );
    });

    it('should own CerticolDAOToken.sol right after deployment', async function() {
        // Predict the contract address once it was deployed
        // Nonce is set as current_nonce + 1 as we need 1 transaction to approve the contract from using the minted token
        let deployAddress = getContractAddress(accounts[0], await web3.eth.getTransactionCount(accounts[0]) + 1);
        // Estimage gas cost for approval call
        let approveGasCost = await GasTokenContract.methods.approve(deployAddress, 172).estimateGas({ from: accounts[0] });
        // Approve the predicted contract address to free up to 172 GST1
        await GasTokenContract.methods.approve(deployAddress, 172).send({ from: accounts[0], gas: approveGasCost });
        // Deploy using CerticolDAOTokenDeployer
        let deployerContract = await CerticolDAOTokenDeployer.new(GasTokenAddress, accounts[1], { from: accounts[0], gas: BLOCK_GAS_LIMIT });
        // Predict the address of the deployed CerticolDAOToken contract
        let tokenAddress = getContractAddress(deployAddress, 1);
        // Assert CerticolDAOToken contract is owned by CerticolDAOTokenDeployer
        let tokenContract = new web3.eth.Contract(CerticolDAOToken._json.abi, tokenAddress);
        expect(await tokenContract.methods.owner().call()).to.have.string(deployerContract.address);
    });

    it('should be able transfer ownership of CerticolDAOToken.sol', async function() {
        // Predict the contract address once it was deployed
        // Nonce is set as current_nonce + 1 as we need 1 transaction to approve the contract from using the minted token
        let deployAddress = getContractAddress(accounts[0], await web3.eth.getTransactionCount(accounts[0]) + 1);
        // Estimage gas cost for approval call
        let approveGasCost = await GasTokenContract.methods.approve(deployAddress, 172).estimateGas({ from: accounts[0] });
        // Approve the predicted contract address to free up to 172 GST1
        await GasTokenContract.methods.approve(deployAddress, 172).send({ from: accounts[0], gas: approveGasCost });
        // Deploy using CerticolDAOTokenDeployer
        let deployerContract = await CerticolDAOTokenDeployer.new(GasTokenAddress, accounts[1], { from: accounts[0], gas: BLOCK_GAS_LIMIT });
        // Transfer ownership to accounts[0]
        let tx = await deployerContract.transferTokenOwnership(accounts[0]);
        // Predict the address of the deployed CerticolDAOToken contract
        let tokenAddress = getContractAddress(deployAddress, 1);
        // Assert CerticolDAOToken contract is owned by accounts[0] after transferal
        let tokenContract = new web3.eth.Contract(CerticolDAOToken._json.abi, tokenAddress);
        expect(await tokenContract.methods.owner().call()).to.have.string(accounts[0]);
    });

    it('should do nothing if transferTokenOwnership is called again after initial transferal', async function() {
        // Predict the contract address once it was deployed
        // Nonce is set as current_nonce + 1 as we need 1 transaction to approve the contract from using the minted token
        let deployAddress = getContractAddress(accounts[0], await web3.eth.getTransactionCount(accounts[0]) + 1);
        // Estimage gas cost for approval call
        let approveGasCost = await GasTokenContract.methods.approve(deployAddress, 172).estimateGas({ from: accounts[0] });
        // Approve the predicted contract address to free up to 172 GST1
        await GasTokenContract.methods.approve(deployAddress, 172).send({ from: accounts[0], gas: approveGasCost });
        // Deploy using CerticolDAOTokenDeployer
        let deployerContract = await CerticolDAOTokenDeployer.new(GasTokenAddress, accounts[1], { from: accounts[0], gas: BLOCK_GAS_LIMIT });
        // Transfer ownership to accounts[0]
        await deployerContract.transferTokenOwnership(accounts[0]);
        // Transfer ownership again which should silently failed
        let tx = await deployerContract.transferTokenOwnership(accounts[1]);
        // Predict the address of the deployed CerticolDAOToken contract
        let tokenAddress = getContractAddress(deployAddress, 1);
        // Assert CerticolDAOToken contract is still owned by accounts[0]
        let tokenContract = new web3.eth.Contract(CerticolDAOToken._json.abi, tokenAddress);
        expect(await tokenContract.methods.owner().call()).to.have.string(accounts[0]);
    });

});