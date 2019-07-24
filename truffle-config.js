const HDWalletProvider = require("truffle-hdwallet-provider");

// Define your own key for deployment and Infura project ID
const key = '';
const infura_id = '';

module.exports = {

    networks: {
        develop: {
            host: '127.0.0.1',
            port: 9545,
            network_id: "*"
        },
        coverage: {
            host: '127.0.0.1',
            port: 8555,
            network_id: "*",
            gas: 0xfffffffffff
        },
        dryrun: {
            provider: function() {
                return new HDWalletProvider(key, "http://localhost:8545") // Local forked chain from Ropsten or main chain
            },
            network_id: "*", // Any ID
            gasPrice: 20000000000, // 20 GWei
            skipDryRun: true // This IS the dry run lol
        },
        ropsten: {
            provider: function() {
                return new HDWalletProvider(key, "https://ropsten.infura.io/v3/" + infura_id) // Ropsten testnet via Infura API
            },
            network_id: 3,
            gasPrice: 20000000000, // 20 GWei
            skipDryRun: true, // Dryrun doesn't work with GasToken.io :(
            timeoutBlocks: 5000
        },
        mainnet: {
            provider: function() {
                return new HDWalletProvider(key, "https://mainnet.infura.io/v3/" + infura_id) // Mainnet via Infura API
            },
            network_id: 1,
            gasPrice: 20000000000, // 20 GWei
            skipDryRun: true, // Dryrun doesn't work with GasToken.io :(
            timeoutBlocks: 5000
        }
    },

    compilers: {
        solc: {
            version: '0.5.3',
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    }
    
};