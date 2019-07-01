// Import library function
const { BN, expectRevert } = require('openzeppelin-test-helpers');
const { expect } = require('chai');

// Obtain contract abstractions
const CerttifyCert = artifacts.require('CerttifyCert')

// Test for CerttifyDAOToken.sol
contract('CerttifyCert', function(accounts) {

    // Storing instance of deployed contract
    var contractInstance;

    // Sample certificate content
    const sampleCert = web3.utils.fromAscii("Sample Certificate");
    // No-receiver-address constant
    const noReceiverAddress = '0x86c515143DA2ae790335F6F1Ce4456D23b47ce6B';

    // Deploy the contract before each test
    beforeEach(async function() {
        contractInstance = await CerttifyCert.new();
    });

    it('should initialize name, symbol and noReceiverAddress correctly', async function() {
        expect(await contractInstance.name()).to.have.string('Certtify Certificate');
        expect(await contractInstance.symbol()).to.have.string('CTC');
    });

    it('should issue a certificate without receiver without additional flag', async function() {
        // Issue a certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, noReceiverAddress, 0, false, false, false, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        // Validate the content of the certificate
        expect(cert.cert).to.have.string(sampleCert);
        expect(cert.expiryBlock).to.be.bignumber.equal(new BN("0"));
        expect(cert.isHashed).to.be.false;
        expect(cert.isOPC).to.be.false;
        // Validate the specification in the blockchain
        let certId = cert.certId;
        let certSpec = await contractInstance.getCertStatus(certId);
        expect(certSpec['0']).to.have.string(accounts[1]); // Certificate issuer
        expect(certSpec['1']).to.have.string(noReceiverAddress); // Current certificate owner
        expect(certSpec['2']).to.be.false; // Revocable flag
        expect(certSpec['3']).to.be.false; // Revoked flag
        // Validate that noReceiverAddress has received the certificate as specified in the Certtify Zero protocol
        expect(await contractInstance.balanceOf(noReceiverAddress)).to.be.bignumber.equal(new BN("1"));
        expect(await contractInstance.ownerOf(certId)).to.have.string(noReceiverAddress);
    });

    it('should issue a certificate without receiver with all additional flags', async function() {
        // Issue a certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, noReceiverAddress, 100, true, true, true, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        // Validate the content of the certificate
        expect(cert.cert).to.have.string(sampleCert);
        expect(cert.expiryBlock).to.be.bignumber.equal(new BN("100"));
        expect(cert.isHashed).to.be.true;
        expect(cert.isOPC).to.be.true;
        // Validate the specification in the blockchain
        let certId = cert.certId;
        let certSpec = await contractInstance.getCertStatus(certId);
        expect(certSpec['0']).to.have.string(accounts[1]); // Certificate issuer
        expect(certSpec['1']).to.have.string(noReceiverAddress); // Current certificate owner
        expect(certSpec['2']).to.be.true; // Revocable flag
        expect(certSpec['3']).to.be.false; // Revoked flag
        // Validate that noReceiverAddress has received the certificate as specified in the Certtify Zero protocol
        expect(await contractInstance.balanceOf(noReceiverAddress)).to.be.bignumber.equal(new BN("1"));
        expect(await contractInstance.ownerOf(certId)).to.have.string(noReceiverAddress);
    });

    it('should issue a certificate with a receiver and allow transfer', async function() {
        // Issue a certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, accounts[2], 100, true, true, true, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        // Validate the content of the certificate
        expect(cert.cert).to.have.string(sampleCert);
        expect(cert.expiryBlock).to.be.bignumber.equal(new BN("100"));
        expect(cert.isHashed).to.be.true;
        expect(cert.isOPC).to.be.true;
        // Validate the specification in the blockchain
        let certId = cert.certId;
        let certSpec = await contractInstance.getCertStatus(certId);
        expect(certSpec['0']).to.have.string(accounts[1]); // Certificate issuer
        expect(certSpec['1']).to.have.string(accounts[2]); // Current certificate owner
        expect(certSpec['2']).to.be.true; // Revocable flag
        expect(certSpec['3']).to.be.false; // Revoked flag
        // Validate that accounts[2] has received the certificate
        expect(await contractInstance.balanceOf(accounts[2])).to.be.bignumber.equal(new BN("1"));
        expect(await contractInstance.ownerOf(certId)).to.have.string(accounts[2]);
        // Validate that accounts[2] can transfer the certificate to accounts[3]
        await contractInstance.safeTransferFrom(accounts[2], accounts[3], certId, { from: accounts[2] });
        // Validate that accounts[3] has received the certificate
        expect(await contractInstance.balanceOf(accounts[2])).to.be.bignumber.equal(new BN("0"));
        expect(await contractInstance.balanceOf(accounts[3])).to.be.bignumber.equal(new BN("1"));
        expect(await contractInstance.ownerOf(certId)).to.have.string(accounts[3]);
    });

    it('should issue a revocable certificate and revoke it', async function() {
        // Issue a certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, accounts[2], 100, true, true, true, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        let certId = cert.certId;
        // Revoke the certificate and validate the RevokeCert event
        txLog = await contractInstance.revokeCert(certId, { from: accounts[1] });
        let revokeEvent = txLog.logs[0].args;
        expect(revokeEvent.certId).to.be.bignumber.equal(certId);
        // Verify that the certificate status now returned the revoked flag
        let certSpec = await contractInstance.getCertStatus(certId);
        expect(certSpec['0']).to.have.string(accounts[1]); // Certificate issuer
        expect(certSpec['1']).to.have.string(accounts[2]); // Current certificate owner
        expect(certSpec['2']).to.be.true; // Revocable flag
        expect(certSpec['3']).to.be.true; // Revoked flag
    });

    it('should not revoke if certificate is not revocable', async function() {
        // Issue a non-revocable certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, accounts[2], 100, false, true, true, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        let certId = cert.certId;
        // Revoke the certificate and validate the RevokeCert event
        await expectRevert(contractInstance.revokeCert(certId, { from: accounts[1] }), "CTC: only revocable certificate can be revoked");
    });

    it('should not revoke if certificate is not revoked by issuer', async function() {
        // Issue a non-revocable certificate and extract the IssueCert event (Log[0] is the Transfer event due to the minting process)
        let txLog = await contractInstance.issueCert(sampleCert, accounts[2], 100, true, true, true, { from: accounts[1] });
        let cert = txLog.logs[1].args;
        let certId = cert.certId;
        // Revoke the certificate and validate the RevokeCert event
        await expectRevert(contractInstance.revokeCert(certId, { from: accounts[2] }), "CTC: only certificate issuer can revoke a certificate");
    });

    it('should return no-receiver-address correctly', async function() {
        expect(await contractInstance.noReceiverAddress()).to.have.string('');
    });

})