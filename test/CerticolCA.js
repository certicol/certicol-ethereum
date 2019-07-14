// Import library function
const { BN, time, expectEvent, expectRevert } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
var CerticolCA;
const CerticolCATestStandard = artifacts.require('CerticolCATestStandard');
const CerticolCATestCoverage = artifacts.require('CerticolCATestCoverage');

// Test for CerticolDAOToken.sol
contract('CerticolCA', function(accounts) {

    // Storing instance of deployed contract
    var contractInstance;

    // Storing constant addresses from Provable-Domain for unit testing
    var addressValid = '0x7A490a716f9033E3B3b51aBEAf579B54ecBffd23';
    var addressInvalid = '0xe3A6F7295890382b2215A81Da25A1a30F99E391d';

    // Storing the number of block time granted per successful ring 2 validation
    const RING_TWO_VALIDITY_PERIOD = 100;
    // Default gas price for Provable callback (10 GWei)
    const GAS_PRICE = '10000000000';

    before(async function() {
        // Send addressValid and addressInvalid some ether for testing
        web3.eth.sendTransaction({
            from: accounts[8],
            to: addressValid,
            value: web3.utils.toWei('450000', 'ether')
        });
        web3.eth.sendTransaction({
            from: accounts[8],
            to: addressInvalid,
            value: web3.utils.toWei('450000', 'ether')
        });
        // Select CerticolCA contract abstraction to use
        let lastBlock = await web3.eth.getBlock("latest");
        if (await lastBlock.gasLimit == 17592186044415) {
            // Swap to coverage-only CerticolCA if on coverage network
            CerticolCA = CerticolCATestCoverage;
        }
        else {
            // Use normal CerticolCATest
            CerticolCA = CerticolCATestStandard;
        }
    });

    describe('Initialization of Contract', function() {

        beforeEach(async function() {
            // Deploy the contract before each test
            contractInstance = await CerticolCA.new();
        });

        it('should be at ring 4 validation status at default', async function() {
            let defaultStatus = await contractInstance.getStatus(accounts[1]);
            expect(defaultStatus[0]).to.be.bignumber.equal(new BN(4)); // Expected ring 4 default status
            expect(defaultStatus[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 4 status
            expect(defaultStatus[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 4 status
        });

        it('should return validity period of ring 2 validation', async function() {
            let validityPeriod = await contractInstance.getRingTwoValidityPeriod();
            expect(validityPeriod).to.be.bignumber.equal(new BN(RING_TWO_VALIDITY_PERIOD)); // Expect 100 blocks in CerticolCATest.sol
        });

    });

    describe('Obtaining Ring 3 and Ring 2 Validation', function() {

        beforeEach(async function() {
            // Deploy the contract before each test
            contractInstance = await CerticolCA.new();
            // Set the provider to WebsocketProvider to allow event subscription used in some test
            let currentHTTPProvider = web3.currentProvider.host;
            contractInstance.contract.setProvider(currentHTTPProvider.replace("http", "ws"));
        });

        it('should allow ring 3 declaration', async function() {
            let receipt = await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: accounts[1] }
            );
            // Expect RingThreeDeclaration event
            expectEvent.inLogs(
                receipt.logs, 'RingThreeDeclaration',
                { 
                    certIssuer: accounts[1], name: 'TEST_NAME', email: 'TEST_EMAIL@EMAIL.COM',
                    phone: '852-9999-9999', additionalInfo: 'SOME_RANDOM_ADDITIONAL_DATA'
                }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(accounts[1]);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
        });
    
        it('should allow ring 2 declaration', async function() {
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: accounts[1] }
            );
            let receipt = await contractInstance.ringTwoDeclaration('https://abc.xyz', { from: accounts[1] });
            // Expect RingTwoDeclaration event
            expectEvent.inLogs(
                receipt.logs, 'RingTwoDeclaration',
                { certIssuer: accounts[1], domainControlled: 'https://abc.xyz' }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(accounts[1]);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
        });
    
        it('should revert ring 2 declaration if msg.sender have not completed ring 3 declaration', async function() {
            await expectRevert(
                contractInstance.ringTwoDeclaration('https://abc.xyz', { from: accounts[1] }),
                "CerticolCA: ring 3 validation is required before ring 2 validation process"
            );
        });
    
        it('should allow ring 2 challenge initialization', async function() {
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: accounts[1] }
            );
            await contractInstance.ringTwoDeclaration('https://abc.xyz', { from: accounts[1] });
            let receipt = await contractInstance.ringTwoChallengeInit(accounts[1], { from: accounts[1] });
            // Expect RingTwoChallengeInit event
            expectEvent.inLogs(
                receipt.logs, 'RingTwoChallengeInit',
                { certIssuer: accounts[1] }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(accounts[1]);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            // Expect getChallenge to work and returned the challenge URL and string
            let challengeId = receipt.logs[1].args.challengeId;
            let challengeDetail = await contractInstance.getChallenge(challengeId);
            expect(challengeDetail['0']).to.have.string('https://abc.xyz' + '/_' + accounts[1].substring(2).toLowerCase() + '.html'); // Expected declared_doamin/_address.html
            expect(challengeDetail['1']).to.have.string('<html><body>' + accounts[1].substring(2).toLowerCase() + '</body></html>'); // Expected <html><body>address</body></html>
        });
    
        it('should revert ring 2 challenge initialization if msg.sender have not completed ring 2 declaration', async function() {
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: accounts[1] }
            );
            await expectRevert(
                contractInstance.ringTwoChallengeInit(accounts[1], { from: accounts[1] }),
                "CerticolCA: msg.sender has not completed ring 2 declaration"
            );
        });
    
        it('should revert ring 2 challenge initialization if msg.sender have not completed ring 3 declaration', async function() {
            await expectRevert(
                contractInstance.ringTwoChallengeInit(accounts[1], { from: accounts[1] }),
                "CerticolCA: msg.sender has not completed ring 2 declaration"
            );
        });
    
        it('should solve ring 2 challenge and grant ring 2 validation', async function() {
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: addressValid }
            );
            await contractInstance.ringTwoDeclaration(
                'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                { from: addressValid }
            );
            let receipt = await contractInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            // Get the Provable cost before solving the challenge
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            // Solve the challenge
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            // Expected RingTwoChallengeResult and returned successful validation
            // Since the event is emitted after __callback, we have to listen and wait for it
            let callbackTxHash = await new Promise(function(resolve, revert) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error, result) {
                        if (error) { revert(error); }
                        resolve(result.transactionHash);
                    }
                );
            });
            // Get current block number
            let currentBlock = await web3.eth.getBlockNumber();
            // Validate the parameters in RingTwoChallengeResult event
            await expectEvent.inTransaction(
                callbackTxHash, contractInstance.constructor, 'RingTwoChallengeResult',
                { 
                    certIssuer: addressValid,
                    challengeId: challengeId,
                    domainControlled: 'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                    expiration: new BN(currentBlock + RING_TWO_VALIDITY_PERIOD),
                    successful: true
                }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(2)); // Expected ring 2 status
            expect(status[1]).to.be.bignumber.equal(new BN(currentBlock)); // Expected currentBlock as issue time
            expect(status[2]).to.be.bignumber.equal(new BN(currentBlock + RING_TWO_VALIDITY_PERIOD)); // Expected 1051200 blocks later as expiration time
        });

        it('should failed ring 2 challenge', async function() {
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: addressInvalid }
            );
            await contractInstance.ringTwoDeclaration(
                'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                { from: addressInvalid }
            );
            let receipt = await contractInstance.ringTwoChallengeInit(addressInvalid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            // Get the Provable cost before solving the challenge
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            // Solve the challenge
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            // Expected RingTwoChallengeResult and returned failed validation
            // The page did exist but will not return the correct challenge string
            let callbackTxHash = await new Promise(function(resolve, revert) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error, result) {
                        if (error) { revert(error); }
                        resolve(result.transactionHash);
                    }
                );
            });
            // Validate the parameters in RingTwoChallengeResult event
            await expectEvent.inTransaction(
                callbackTxHash, contractInstance.constructor, 'RingTwoChallengeResult',
                { 
                    certIssuer: addressInvalid,
                    challengeId: challengeId,
                    domainControlled: 'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                    expiration: new BN(0),
                    successful: false
                }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(addressInvalid);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
        });

        it('should revert if challengeId is not found', async function() {
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            await expectRevert(
                contractInstance.ringTwoChallengeSolve(new BN(0), { from: accounts[2], value: cost, gasPrice: GAS_PRICE }),
                "CerticolCA: no challenge with that id was found"
            );
        });

    });

    describe('Expiration, Renewal and Reset of Ring 2 Validation', function() {

        beforeEach(async function() {
            // Deploy the contract before each test
            contractInstance = await CerticolCA.new();
            // Set the provider to WebsocketProvider to allow event subscription used in some test
            let currentHTTPProvider = web3.currentProvider.host;
            contractInstance.contract.setProvider(currentHTTPProvider.replace("http", "ws"));
            // Obtain initial ring 2 validation for addressValid
            await contractInstance.ringThreeDeclaration(
                'TEST_NAME', 'TEST_EMAIL@EMAIL.COM', '852-9999-9999', 'SOME_RANDOM_ADDITIONAL_DATA',
                { from: addressValid }
            );
            await contractInstance.ringTwoDeclaration(
                'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                { from: addressValid }
            );
            let receipt = await contractInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            await new Promise(function(resolve) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error) {
                        if (error) { revert(error); }
                        resolve();
                    }
                );
            });
        });

        it('should expire ring 2 validation after RING_TWO_VALIDITY_PERIOD blocks', async function() {
            // Spam 100 blocks to expire ring 2 validation
            // P.S. RING_TWO_VALIDITY_PERIOD is modified to 100 in CerticolCATest for easier testing
            for (i=0; i<RING_TWO_VALIDITY_PERIOD; i++) {
                await time.advanceBlock();
            }
            // Get current validation status
            let status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
        });

        it('should allow renewal of ring 2 validation WITHOUT changes to the block of issue if renewed BEFORE expiration', async function() {
            // Record current block number when we first obtain initial ring 2 validation
            let blockIssue = await web3.eth.getBlockNumber();
            // Initalize another ring 2 challenge to renew
            let receipt = await contractInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            // Get Provable cost
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            // Solve the challenge again
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            // Expected RingTwoChallengeResult and returned successful validation
            await new Promise(function(resolve, revert) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error, result) {
                        if (error) { revert(error); }
                        resolve(result.transactionHash);
                    }
                );
            });
            // Get current block number
            let currentBlock = await web3.eth.getBlockNumber();
            // Get current validation status
            let status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(2)); // Expected ring 2 status
            expect(status[1]).to.be.bignumber.equal(new BN(blockIssue)); // Expected blockIssue, the block number upon initial granting of ring 2 validation, as issue time
            expect(status[2]).to.be.bignumber.equal(new BN(currentBlock + RING_TWO_VALIDITY_PERIOD)); // Expected 1051200 blocks later from now as expiration time
        });
    
        it('should allow renewal of ring 2 validation WITH changes to the block of issue if renewed AFTER expiration', async function() {
            // Spam 100 blocks to expire ring 2 validation
            for (i=0; i<RING_TWO_VALIDITY_PERIOD; i++) {
                await time.advanceBlock();
            }
            // Initalize another ring 2 challenge to renew
            let receipt = await contractInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            // Get Provable cost
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            // Solve the challenge again
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            // Expected RingTwoChallengeResult and returned successful validation
            await new Promise(function(resolve, revert) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error, result) {
                        if (error) { revert(error); }
                        resolve(result.transactionHash);
                    }
                );
            });
            // Get current block number
            let currentBlock = await web3.eth.getBlockNumber();
            // Get current validation status
            let status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(2)); // Expected ring 2 status
            expect(status[1]).to.be.bignumber.equal(new BN(currentBlock)); // Expected currentBlock as issue time
            expect(status[2]).to.be.bignumber.equal(new BN(currentBlock + RING_TWO_VALIDITY_PERIOD)); // Expected 1051200 blocks later as expiration time
        });

        it('should reset ring 2 validation if domain is redeclared using ringTwoDeclaration', async function() {
            // Redeclare domain after gaining ring 2 validation
            await contractInstance.ringTwoDeclaration(
                'https://abc.xyz',
                { from: addressValid }
            );
            // Get current validation status
            let status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(3)); // Expected ring 3 status
            expect(status[1]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            expect(status[2]).to.be.bignumber.equal(new BN(0)); // Expected 0 for ring 3 status
            // Regain ring 2 validation again
            await contractInstance.ringTwoDeclaration(
                'https://raw.githubusercontent.com/certicol/provable-domain/master/test/html',
                { from: addressValid }
            );
            let receipt = await contractInstance.ringTwoChallengeInit(addressValid, { from: accounts[2] });
            let challengeId = receipt.logs[1].args.challengeId;
            let cost = await contractInstance.getProvableCost.call(GAS_PRICE);
            await contractInstance.ringTwoChallengeSolve(challengeId, { from: accounts[2], value: cost, gasPrice: GAS_PRICE });
            await new Promise(function(resolve) {
                contractInstance.contract.events.RingTwoChallengeResult(
                    function(error) {
                        if (error) { revert(error); }
                        resolve();
                    }
                );
            });
            // Get current block number
            let currentBlock = await web3.eth.getBlockNumber();
            // Get current validation status again
            status = await contractInstance.getStatus(addressValid);
            expect(status[0]).to.be.bignumber.equal(new BN(2)); // Expected ring 2 status
            expect(status[1]).to.be.bignumber.equal(new BN(currentBlock)); // Expected currentBlock as issue time, NOT the initial issue time
            expect(status[2]).to.be.bignumber.equal(new BN(currentBlock + RING_TWO_VALIDITY_PERIOD)); // Expected 1051200 blocks later as expiration time
        });

    });

});