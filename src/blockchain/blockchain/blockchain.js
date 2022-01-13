const SHA265 = require('crypto-js/sha256');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const _ = require('lodash');
const {getCoinbaseTransaction, isValidAddress, processTransactions, Transaction} = require('../transactions/transaction');
const {createTransaction, getBalance, getPrivateFromWallet, getPublicFromWallet, findUnspentTxOuts} = require('../wallet/wallet');
const {addToTransactionPool, getTransactionPool, updateTransactionPool} = require('../transactions/transactionPool');

class Block {
    constructor(index, timeStamp, data, previousHash = '', difficulty) {
        this.index = index;
        this.timeStamp = timeStamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
        this.difficulty = difficulty;
        this.nonce = 0;
    }

    calculateHash() {
        return SHA265(this.index + this.previousHash + this.timeStamp + JSON.stringify(this.data) + this.difficulty + this.nonce).toString();
    }

    mineBlock(difficulty) {
        while(this.hash.substring(0, this.difficulty) !== Array(this.difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        
        console.log("Block mined: " + this.hash)
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 3;
        this.diffAdjustInterval = 5;
        this.blockGenerationInterval = 1;
    }

    createGenesisData() {
        return {
            'nickname': '',
            'time': '',
            'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
        };
    }  

    createGenesisBlock() {
        return new Block(0, Date.now(), [this.createGenesisData()], '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', 0);
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    getBlockChain() {
        return this.chain;
    }

    getUnspentTxOuts() {
        return _.cloneDeep(this.unspentTxOuts);
    }

    setUnspentTxOuts(newUnspentTxOut) {
        console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
        this.unspentTxOuts = newUnspentTxOut;
    }



    addBlock(newBlock) {
        newBlock.hash = newBlock.calculateHash();
        if (this.getLatestBlock().index % this.diffAdjustInterval === 0 && this.getLatestBlock().index > 0) {
            this.difficulty = this.adjustDifficulty();
        }
        if (this.isChainValid()) {
            console.log("ADDED");
            this.chain.push(newBlock);
            return true;
        }
        else {
            console.log("NOT ADDED");
            return false;
        }
    }

    getAccountBalance() {
        return getBalance(getPublicFromWallet(), this.unspentTxOuts);
    };

    getSpecificAccountBalance(address) {
        return getBalance(address, this.unspentTxOuts);
    }

    mineBlock(nickname, time) {
        const data = {
            'nickname': nickname,
            'time': time
        };
        const block = new Block(this.getLatestBlock().index + 1, Date.now(), data, this.getLatestBlock().hash, this.difficulty);
        block.mineBlock(this.difficulty);
        this.addBlock(block);
    }

    getMyUnspentTransactionOutputs() {
        return findUnspentTxOuts(getPublicFromWallet(), this.getUnspentTxOuts());
    };

    mineTransaction(receiverAddress, amount) {
        if (!isValidAddress(receiverAddress)) {
            throw Error('invalid address');
        }
        if (typeof amount !== 'number') {
            throw Error('invalid amount');
        }
        const coinbaseTx = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
        const tx = createTransaction(receiverAddress, amount, getPrivateFromWallet(), this.unspentTxOuts);
        const block = new Block(this.getLatestBlock().index + 1, Date.now(), [coinbaseTx, tx], this.getLatestBlock().hash, this.difficulty);
        block.mineBlock(this.difficulty);
        this.addBlock(block);
    }

    generateWallet(public_key) {
        const tx = getCoinbaseTransaction(public_key, this.getLatestBlock().index);
        const retVal = processTransactions([tx], this.getUnspentTxOuts(), this.getLatestBlock().index);
        if (this.isChainValid()) {
            if (retVal === null) {
                return false;
            } else {
                this.setUnspentTxOuts(retVal);
                updateTransactionPool(this.unspentTxOuts);
                return true;
            }
        }

    }

    replaceChain(newChain) {
        this.chain = newChain;
    }

    sendTransaction(address, amount) {
        const tx = createTransaction(address, amount, getPrivateFromWallet(), this.getUnspentTxOuts(), getTransactionPool());
        if(addToTransactionPool(tx, this.getUnspentTxOuts()) == false) return false;
        return tx;
    };

    sendCoustomTransaction(address, amount, private_key) {
        const tx = createTransaction(address, amount, private_key, this.getUnspentTxOuts(), getTransactionPool());
        if (tx == false) return false;
        addToTransactionPool(tx, this.getUnspentTxOuts());
        return tx;
    };

    handleReceivedTransaction(transaction) {
        addToTransactionPool(transaction, this.getUnspentTxOuts());
    };
    

    isChainValid() {
        for(let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
            if (currentBlock.index !== previousBlock.index + 1) {
                return false
            }
            if ((currentBlock.TimeStamp - previousBlock.timeStamp) > 60000) {
                return false;
            }
        }

        return true;
    }

    adjustDifficulty() {
        const previousAdjustment = this.chain[this.chain.length - this.diffAdjustInterval];
        const timeExpected = this.blockGenerationInterval * this.diffAdjustInterval;
        const timeTaken = this.getLatestBlock().timeStamp - previousAdjustment.timeStamp
        if (timeTaken < timeExpected * 1000 / 2) {
            console.log("Rise in difficulty");
            if (this.difficulty + 1)
            return this.difficulty + 1;
        }
        if (timeTaken > timeExpected * 1000 * 2) {
            console.log("Decrease in difficulty");
            if (this.difficulty - 1 === 0) return this.difficulty;
            return this.difficulty - 1;
        }

        return previousAdjustment.difficulty;
    }
}

module.exports.Blockchain = Blockchain;
module.exports.Transaction = Transaction;
module.exports.Block = Block;