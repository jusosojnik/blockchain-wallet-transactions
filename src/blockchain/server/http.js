const https = require('http');
const {Blockchain, Block} = require('../blockchain/blockchain');
const { addToTransactionPool} = require('../transactions/transactionPool');
const { generatePrivateKey, generateCustomPublicKey } = require('../wallet/wallet');
const args = process.argv.slice(2);
const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

var nodes = [args[0]];

function waitForUserInput() {
    readline.question("Add node (port number/exit): ", function(answer) {
      if (answer == "exit"){
        readline.close();
      } else {
          nodes.push(answer);
          console.log(nodes);
          waitForUserInput();
      }
    });
}

let chain = new Blockchain();

https.createServer(function (req, res) {
    var body = '';
    req.on('data', chunk => {
        body += chunk;
    });
    req.on('end', () => {
        switch (req.url) {
            case "/lastNode":
                res.write(nodes[nodes.length - 1]);
                break;
            case "/allNodes":
                if (body !== '') {
                    var tmpNodes = JSON.parse(body);
                    for (var i = 0; i < tmpNodes.length; i++) {
                        if (!nodes.includes(tmpNodes[i])) {
                            nodes.push(tmpNodes[i]);
                        }
                    }
                }
                else {
                    var tmpNodes = [];
                }
                function getPromise() {
                    return new Promise((resolve, reject) => {
                        var areR = false;
                        var reqNum = 0;
                        var resNum = 0;
                        const data3 = JSON.stringify(nodes);
                        for (var i = 0; i < nodes.length; i++) {
                            if (!tmpNodes.includes(nodes[i]) && args[0] !== nodes[i]) {
                                areR = true;
                                reqNum++;
                                const options2 = {
                                    host: 'localhost',
                                    port: nodes[i],
                                    path: '/allNodes',
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Content-Length': data3.length
                                    }
                                };
                                let re = https.request(options2, function(response) {
                                    var str = '';
                                    response.on('data', function (chunk) {
                                        str += chunk;
                                    var nodes2 = JSON.parse(str);
                                        for (var i = 0; i < nodes2.length; i++) {
                                            if (!nodes.includes(nodes2[i])) {
                                                nodes.push(nodes2[i]);
                                            }
                                        }
                                    });
                                    response.on('end', function () {
                                        resNum++;
                                        console.log(str);
                                        if (resNum === reqNum) {
                                            resolve(nodes);
                                        }
                                    });
                                }).on('error', (error) => {
                                    console.error(error.message);
                                    resNum++;
                                    if (resNum === reqNum) {
                                        resolve(nodes);
                                    }
                                    
                                });
                                re.write(data3);
                                re.end();
                            }
                        }
                        if (areR === false) {
                            resolve(nodes);
                        }
                    });
                }
                async function makeSynchronousRequest(request) {
                    try {
                        let http_promise = getPromise();
                        let response_body = await http_promise;
                
                        console.log(response_body);
                        console.log(nodes);
                        res.write(JSON.stringify(nodes));
                        res.end();
                    }
                    catch(error) {
                        console.log(error.message);
                    }
                }
                (async function () {
                    await makeSynchronousRequest();
                })();
                
                break;
            case "/addBlock":
                try {
                    if (chain.getLatestBlock().index === Object.assign(new Block, JSON.parse(body)).index - 1) {
                        if (chain.addBlock(Object.assign(new Block, JSON.parse(body)))) {
                            res.write('Block Added');
                            res.end();
                        } else {
                            res.write('Block Not Added...\nRequesting Chain');
                            res.end();
                        }
                    }
                    else if (chain.getLatestBlock().index <= Object.assign(new Block, JSON.parse(body)).index - 1) {
                        res.write('Block Not Added...\nRequesting Chain');
                        res.end();
                    }
                    else {
                        const data2 = JSON.stringify(chain);
                        res.write(data2);
                        res.end();
                    }
                } catch(error) {
                    res.write(error.message);
                    res.end();
                }
                
                break;
            case "/mineBlock":
                const obj = JSON.parse(body);
                chain.mineBlock(obj.nickname, obj.time);
                res.write("Block Mined");
                res.end();
                ignore = false;
                console.log(nodes);
                const data = JSON.stringify(chain.getLatestBlock());
                for (var i = 0; i < nodes.length; i++) {
                    if (nodes[i] === args[0]) i++;
                    const options = {
                        hostname: 'localhost',
                        port: nodes[i],
                        path: '/addBlock',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': data.length
                        }
                    }
                    const requ = https.request(options, function(res) {
                        var str = '';
                        res.on('data', function (chunk) {
                        str += chunk;
                        });
                    
                        res.on('end', function () {
                        if (str === 'Block Not Added...\nRequesting Chain') {
                            console.log(str);
                            const data2 = JSON.stringify(chain);
                            const tmp = Object.assign(new Blockchain, JSON.parse(data2));
                            for (var i = 0; i < tmp.chain.length; i++) {
                                tmp.chain[i] = Object.assign(new Block, tmp.chain[i]);
                            }
                            const options2 = {
                                hostname: 'localhost',
                                port: options.port,
                                path: '/replaceChain',
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': data2.length
                                }
                            }      
                            const requ = https.request(options2, function(res) {
                                var str = '';
                                res.on('data', function (chunk) {
                                });
                            
                                res.on('end', function () {
                                console.log(str);
                                });
                            });
                            requ.on('error', (error) => {
                                console.error(error.message);
                            })
                            requ.write(data2);
                            requ.end();
                        }
                        else if (str !== 'Block Added') {
                            chain = Object.assign(new Blockchain, JSON.parse(str));
                            for (var i = 0; i < chain.chain.length; i++) {
                                chain.chain[i] = Object.assign(new Block, chain.chain[i]);
                            }
                            console.log('Chain Synchronized');
                        }
                        else {
                            console.log(str);
                        }
                        });
                    });
                    requ.on('error', (error) => {
                        console.error(error.message);
                    })
                    requ.write(data);
                    requ.end();
                }
                break;
            case "/getLastBlock":
                res.write(JSON.stringify(chain.getLatestBlock()));
                res.end();
                break;
            case "/replaceChain":
                chain = Object.assign(new Blockchain, JSON.parse(body));
                for (var i = 0; i < chain.chain.length; i++) {
                    chain.chain[i] = Object.assign(new Block, chain.chain[i]);
                }
                res.write("Chain Synchronized");
                res.end();
                break;
            case "/getChain":
                res.write(JSON.stringify(chain));
                res.end();
                break;
            case "/newAddress":
                var private_key = generatePrivateKey();
                var public_key = generateCustomPublicKey(private_key);
                chain.generateWallet(public_key);
                res.write(private_key + '\n' + public_key);
                res.end();
                const data6 = public_key;
                for (var i = 0; i < nodes.length; i++) {
                    if (nodes[i] === args[0]) i++;
                    const options = {
                        hostname: 'localhost',
                        port: nodes[i],
                        path: '/addAddress',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': data6.length
                        }
                    }
                    const requ = https.request(options, function(res) {
                        var str = '';
                        res.on('data', function (chunk) {
                            str += chunk;
                        });
                    
                        res.on('end', function () {
                        
                        });
                    });
                    requ.on('error', (error) => {
                        console.error(error.message);
                    })
                    requ.write(data6);
                    requ.end();
                }
                break;
            case "/addTransaction":
                var address = "";
                var amount = "";
                var private_key = "";
                var i = 0
                for (i; i < body.length; i++) {
                    if (body[i] === ' ') {
                        i++;
                        break;
                    }
                    address += body[i];
                }
                for (i; i < body.length; i++) {
                    if (body[i] === ' ') {
                        i++;
                        break;
                    }
                    amount += body[i];
                }
                for (i; i < body.length; i++) {
                    if (body[i] === ' ') {
                        i++;
                        break;
                    }
                    private_key += body[i];
                }
                var tx = chain.sendCoustomTransaction(address, parseInt(amount), private_key);
                if (tx === false) {
                    const eMsg = 'Cannot create transaction from the inputs';
                    res.write(eMsg);
                    res.end();
                } else {
                    res.write('Transaction added');
                    res.end();
                }
                const data5 = JSON.stringify(tx);
                for (var i = 0; i < nodes.length; i++) {
                    if (nodes[i] === args[0]) i++;
                    const options = {
                        hostname: 'localhost',
                        port: nodes[i],
                        path: '/addToPool',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': data5.length
                        }
                    }
                    const requ = https.request(options, function(res) {
                        var str = '';
                        res.on('data', function (chunk) {
                            str += chunk;
                        });
                    
                        res.on('end', function () {
                        
                        });
                    });
                    requ.on('error', (error) => {
                        console.error(error.message);
                    })
                    requ.write(data5);
                    requ.end();
                }
                break;
            case "/addressState":
                console.log(body.toString());
                res.write(chain.getSpecificAccountBalance(body).toString());
                res.end();
                break; 
            case "/addToPool":
                addToTransactionPool(JSON.parse(body), chain.getUnspentTxOuts());
                res.write('Added to pool');
                res.end();
                break;
            case "/addAddress":
                chain.generateWallet(body);
                res.write('Address added');
                res.end();
                break;
            case "/updatePool":
                break;
            default:
                res.write('Nothing Happens');
                res.end();
                break;
        }
    }).on('error', (error) => {
        console.log(error);
    });
}).listen(process.env.PORT || 5000);

waitForUserInput();