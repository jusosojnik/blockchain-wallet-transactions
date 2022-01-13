const {ec} = require('elliptic');
const {existsSync, readFileSync, unlinkSync, writeFileSync} = require('fs');
const _ = require('lodash');
const {getPublicKey, getTransactionId, signTxIn, Transaction, TxIn, TxOut} = require('../transactions/transaction');
const EC = new ec('secp256k1');
const privateKeyLocation = './wallet/private_key';

const getPrivateFromWallet = () => {
    const buffer = readFileSync(privateKeyLocation, 'utf8');
    return buffer.toString();
};

const getPublicFromWallet = () => {
    const privateKey = getPrivateFromWallet();
    const key = EC.keyFromPrivate(privateKey, 'hex');
    return key.getPublic().encode('hex');
};

const generateCustomPublicKey = (private_key) => {
    const key = EC.keyFromPrivate(private_key, 'hex');
    return key.getPublic().encode('hex');
}

const generatePrivateKey = () => {
    const keyPair = EC.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};

const initWallet = () => {
    if (existsSync(privateKeyLocation)) {
        return;
    }
    const newPrivateKey = generatePrivateKey();
    writeFileSync(privateKeyLocation, newPrivateKey);
    console.log('new wallet with private key created');
};

const deleteWallet = () => {
    if (existsSync(privateKeyLocation)) {
        unlinkSync(privateKeyLocation);
    }
};

const getBalance = (address, unspentTxOuts) => {
    return _(unspentTxOuts)
        .filter((uTxO) => uTxO.address === address)
        .map((uTxO) => uTxO.amount)
        .sum();
};

const findUnspentTxOuts = (ownerAddress, unspentTxOuts) => {
    return _.filter(unspentTxOuts, (uTxO) => uTxO.address === ownerAddress);
};

const findTxOutsForAmount = (amount, myUnspentTxOuts) => {
    let currentAmount = 0;
    const includedUnspentTxOuts = [];
    for (const myUnspentTxOut of myUnspentTxOuts) {
        includedUnspentTxOuts.push(myUnspentTxOut);
        currentAmount = currentAmount + myUnspentTxOut.amount;
        if (currentAmount >= amount) {
            const leftOverAmount = currentAmount - amount;
            return {includedUnspentTxOuts, leftOverAmount}
        }
    }
    const eMsg = 'Cannot create transaction from the available unspent transaction outputs.' +
    ' Required amount:' + amount + '. Available unspentTxOuts:' + JSON.stringify(myUnspentTxOuts);
    return false;
};

const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
    const txOut1 = new TxOut(receiverAddress, amount);
    if (leftOverAmount === 0) {
        return [txOut1];
    } else {
        const leftOverTx = new TxOut(myAddress, leftOverAmount);
        return [txOut1, leftOverTx];
    }
};

const filterTxPoolTxs = (unspentTxOuts, transactionPool) => {
    const txIns = _(transactionPool)
        .map((tx) => tx.txIns)
        .flatten()
        .value();
    const removable = [];
    for (const unspentTxOut of unspentTxOuts) {
        const txIn = _.find(txIns, (aTxIn) => {
            return aTxIn.txOutIndex === unspentTxOut.txOutIndex && aTxIn.txOutId === unspentTxOut.txOutId;
        });

        if (txIn === undefined) {

        } else {
            removable.push(unspentTxOut);
        }
    }

    return _.without(unspentTxOuts, ...removable);
};

const createTransaction = (receiverAddress, amount, privateKey, unspentTxOuts) => {

    const myAddress = getPublicKey(privateKey);
    const myUnspentTxOuts = unspentTxOuts.filter((uTxO) => uTxO.address === myAddress);

    const {includedUnspentTxOuts, leftOverAmount} = findTxOutsForAmount(amount, myUnspentTxOuts);

    if (findTxOutsForAmount(amount, myUnspentTxOuts) === false) return false;

    const toUnsignedTxIn = (unspentTxOut) => {
        const txIn = new TxIn();
        txIn.address = myAddress;
        txIn.txOutId = unspentTxOut.txOutId;
        txIn.txOutIndex = unspentTxOut.txOutIndex;
        return txIn;
    };

    const unsignedTxIns = includedUnspentTxOuts.map(toUnsignedTxIn);

    const tx = new Transaction();
    tx.txIns = unsignedTxIns;
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
    tx.id = getTransactionId(tx);

    tx.txIns = tx.txIns.map((txIn, index) => {
        txIn.signature = signTxIn(tx, index, privateKey, unspentTxOuts);
        return txIn;
    });

    return tx;
};

module.exports.createTransaction = createTransaction;
module.exports.getPublicFromWallet = getPublicFromWallet;
module.exports.getPrivateFromWallet = getPrivateFromWallet;
module.exports.getBalance = getBalance;
module.exports.generatePrivateKey = generatePrivateKey;
module.exports.initWallet = initWallet;
module.exports.deleteWallet = deleteWallet;
module.exports.findUnspentTxOuts = findUnspentTxOuts;
module.exports.filterTxPoolTxs = filterTxPoolTxs;
module.exports.generateCustomPublicKey = generateCustomPublicKey;