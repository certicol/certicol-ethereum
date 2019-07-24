// Import library
const fs = require('fs');
const assert = require('assert');
const ora = require('ora');
const RLP = require('rlp');
const Web3 = require('web3');
const HDWalletProvider = require("truffle-hdwallet-provider");

// Import contracts to be deployed
const CerticolCADeployer = artifacts.require('CerticolCADeployer');
const CerticolDAODeployer = artifacts.require('CerticolDAODeployer');
const CerticolDAOTokenDeployer = artifacts.require('CerticolDAOTokenDeployer');

// GasToken.io (GST1) token required by each deployer contract
const CerticolCADeployerToken = 167;
const CerticolDAODeployerToken = 243;
const CerticolDAOTokenDeployerToken = 172;

// Common gas price used in normal Web3 transaction
const gasPrice = 100000000000; // 100 GWei since we cannot afford these to timeout

// Read GasTokenABI and Bytecode from file
const GasTokenBytecode = fs.readFileSync(__dirname + '/GasToken.txt', 'UTF-8').toString();
const GasTokenABI = JSON.parse(fs.readFileSync(__dirname + '/GasTokenABI.txt', 'UTF-8').toString());

// Define your own key for deployment and Infura project ID
const key = '';
const infura_id = '';

// Define address of the contract deployer
var contractDeployer = '';

/**
 * Initialize a Web3 instance
 * @param {string} network network identifing string
 * @return {*} initialized Web3 instance
 */
function getWeb3(network) {
    if (network == 'live') {
        // Use mainnet Infura API
        let api = 'https://mainnet.infura.io/v3/' + infura_id;
        // Create provider
        let provider = new HDWalletProvider(key, api);
        // Create and return Web3 instance
        return new Web3(provider);
    }
    else if (network == 'ropsten') {
        // Use Ropsten Infura API
        let api = 'https://ropsten.infura.io/v3/' + infura_id;
        // Create provider
        let provider = new HDWalletProvider(key, api);
        // Create and return Web3 instance
        return new Web3(provider);
    }
    else if (network == 'dryrun') {
        // Use local forked network from Ropsten
        // Create provider
        let provider = new HDWalletProvider(key, 'http://localhost:8545');
        // Create and return Web3 instance
        return new Web3(provider);
    }
}

/**
 * Get the address of GasToken.io (GST1) contract
 * @param {string} network the network identifier
 * @return {string} the adddress of the GST1 contract in the provided network
 */
async function getGST1(network) {
    console.log();
    if (network == 'live') {
        // Use pre-deployed GST1 contract
        var spinner = ora('Initializing GasToken.io (GST1) contract before deployment procedures').start();
        spinner.succeed('GasToken.io (GST1) contract initialized');
        return '0x88d60255f917e3eb94eae199d827dad837fac4cb';
    }
    else if (network == 'ropsten') {
        // Use pre-deployed GST1 contract
        var spinner = ora('Initializing GasToken.io (GST1) contract before deployment procedures').start();
        spinner.succeed('GasToken.io (GST1) contract initialized');
        return '0x88d60255f917e3eb94eae199d827dad837fac4cb';
    }
    else if (network == 'dryrun') {
        // Instead of using the pre-deployed contract, we found that deploying one locally allow more reliable freeing for testing
        // Deploy GasToken.io contract onto the testnet
        var spinner = ora('Redeploying GasToken.io (GST1) on testchain').start();
        let web3 = getWeb3(network);
        let tx = await web3.eth.sendTransaction({
            from: contractDeployer,
            data: GasTokenBytecode,
            gas: 6721975,
            gasPrice: 1
        });
        let deployedGSTAddress = tx.contractAddress;
        // Mint GST1 equivalent to GST1 token owned by contractDeployer in main chain on this testnet
        let deployedGSTContractMain = new web3.eth.Contract(GasTokenABI, '0x88d60255f917e3eb94eae199d827dad837fac4cb');
        let tokenToMint = await deployedGSTContractMain.methods.balanceOf(contractDeployer).call();
        spinner.text = 'Minting ' + tokenToMint + ' in testchain GasToken.io contract...';
        let deployedGSTContract = new web3.eth.Contract(GasTokenABI, deployedGSTAddress);
        let gasCost = await deployedGSTContract.methods.mint(100).estimateGas({ from: contractDeployer });
        while (tokenToMint > 0) {
            if (tokenToMint > 100) {
                await deployedGSTContract.methods.mint(100).send({ from: contractDeployer, gas: gasCost, gasPrice: gasPrice });
                tokenToMint -= 100;
                spinner.text = tokenToMint + ' GST1 left to mint...';
            }
            else {
                await deployedGSTContract.methods.mint(tokenToMint).send({ from: contractDeployer, gas: gasCost, gasPrice: gasPrice });
                tokenToMint = 0;
            }
        }
        spinner.succeed('GasToken.io (GST1) contract initialized');
        return deployedGSTAddress;
    }
}

/**
 * Utility function for computing the deployed contract address
 * @param {string} sender address of the contract deployer
 * @param {number} nonce nonce used to deploy the contract
 * @return {string} the predicted contract address
 */
function getContractAddress(sender, nonce) {
    return '0x' + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
}

/**
 * Approve next deployed contract to freed a specified amount of GST1 token
 * @param {*} web3 initialized Web3 instance
 * @param {*} gasTokenContract initialized GasToken.io (GST1) contract
 * @param {string} deployerAccount address of the account that will deploy the contract
 * @param {number} token_to_free number of tokens to approve the contract to freed
 */
async function approveGST1(web3, gasTokenContract, deployerAccount, token_to_free) {
    // Predict the contract address once it was deployed
    // Nonce is set as current_nonce + 1 as we need 1 transaction to approve the contract from using the minted token
    let deployAddress = getContractAddress(deployerAccount, await web3.eth.getTransactionCount(deployerAccount) + 1);
    const spinner = ora('Authorizing ' + deployAddress + ' to spend up to ' + token_to_free + ' GST1 from ' + deployAddress).start();
    // Estimage gas cost for approval call
    let approveGasCost = await gasTokenContract.methods.approve(deployAddress, token_to_free).estimateGas({ from: deployerAccount });
    // Approve the predicted contract address to free up to token_to_free GST1
    await gasTokenContract.methods.approve(deployAddress, token_to_free).send({ from: deployerAccount, gas: approveGasCost, gasPrice: gasPrice });
    spinner.succeed('Authorized ' + deployAddress + ' to spend up to ' + token_to_free + ' GST1 from ' + deployAddress);
}

// Deployment definition
module.exports = async function(deployer, network, accounts) {
    // Only deploy if network is either live, ropsten or dryrun (forked ropsten) network
    if (network == 'live' || network == 'ropsten' || network == 'dryrun') {
        // Set contract deployer as accounts[0]
        contractDeployer = accounts[0];
        // Setup Web3 instance
        let web3 = getWeb3(network, deployer);
        // Setup GasToken.io (GST1) contract address
        let GST1_Address = await getGST1(network);
        // Create a GasToken.io contract instance
        let gasTokenContract = new web3.eth.Contract(GasTokenABI, GST1_Address);
        // Compute the required number of tokens for all deployer contracts
        let totalTokenUsed = CerticolCADeployerToken + CerticolDAODeployerToken + CerticolDAOTokenDeployerToken;
        // Query the amount of GasToken.io (GST1) token the deployer have
        let tokenBalance = await gasTokenContract.methods.balanceOf(contractDeployer).call();
        // Assert contractDeployer have sufficient GST1 tokens
        assert(tokenBalance > totalTokenUsed, 'insufficient GST1 tokens in deployer account');
        // Approve CerticolCADeployer to use GST1 tokens
        await approveGST1(web3, gasTokenContract, contractDeployer, CerticolCADeployerToken);
        // Deploy CerticolCA
        await deployer.deploy(CerticolCADeployer, GST1_Address, { gas: 6721975 });
        // Approve CerticolDAOTokenDeployer to use GST1 tokens
        await approveGST1(web3, gasTokenContract, contractDeployer, CerticolDAOTokenDeployerToken);
        // Deploy CerticolDAOToken with initial supply minted to contractDeployer
        await deployer.deploy(CerticolDAOTokenDeployer, GST1_Address, contractDeployer, { gas: 6721975 });
        // Approve CerticolDAODeployer to use GST1 tokens
        await approveGST1(web3, gasTokenContract, contractDeployer, CerticolDAODeployerToken);
        // Compute the CerticolCA and CerticolDAOToken contract address
        let CerticolCAAddress = getContractAddress(CerticolCADeployer.address, 1);
        let CerticolDAOTokenAddress = getContractAddress(CerticolDAOTokenDeployer.address, 1);
        // Deploy CerticolDAO
        await deployer.deploy(CerticolDAODeployer, GST1_Address, CerticolDAOTokenAddress, CerticolCAAddress, { gas: 8000000 });
        // Transfer ownership of CerticolDAOToken to deployed CerticolDAO
        const spinner = ora('Transferring ownership of CerticolDAOToken to CerticolDAO').start();
        let CerticolDAOTokenDeployerContract = new web3.eth.Contract(CerticolDAOTokenDeployer._json.abi, CerticolDAOTokenDeployer.address);
        let CerticolDAOAddress = getContractAddress(CerticolDAODeployer.address, 1);
        let transferOwnershipGas = await CerticolDAOTokenDeployerContract.methods.transferTokenOwnership(CerticolDAOAddress).estimateGas({ from: contractDeployer });
        await CerticolDAOTokenDeployerContract.methods.transferTokenOwnership(CerticolDAOAddress).send({ from: contractDeployer, gas: transferOwnershipGas, gasPrice: gasPrice });
        spinner.succeed('Deployment completed');
    }
}