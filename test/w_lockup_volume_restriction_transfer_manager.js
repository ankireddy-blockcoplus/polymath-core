import latestTime from './helpers/latestTime';
import { duration, promisifyLogWatch, latestBlock } from './helpers/utils';
import takeSnapshot, { increaseTime, revertToSnapshot } from './helpers/time';
import { encodeProxyCall } from './helpers/encodeCall';
import { setUpPolymathNetwork, deployLockupVolumeRTMAndVerified } from "./helpers/createInstances";
import { catchRevert } from "./helpers/exceptions";

const SecurityToken = artifacts.require('./SecurityToken.sol');
const GeneralTransferManager = artifacts.require('./GeneralTransferManager');
const LockUpVolumeRestrictionTM = artifacts.require('./LockupVolumeRestrictionTM');
const GeneralPermissionManager = artifacts.require('./GeneralPermissionManager');

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")) // Hardcoded development port

contract('LockupVolumeRestrictionTransferManager', accounts => {

    // Accounts Variable declaration
    let account_polymath;
    let account_issuer;
    let token_owner;
    let account_investor1;
    let account_investor2;
    let account_investor3;
    let account_investor4;

    // investor Details
    let fromTime = latestTime();
    let toTime = latestTime();
    let expiryTime = toTime + duration.days(15);

    let message = "Transaction Should Fail!";

    // Contract Instance Declaration
    let P_LockUpVolumeRestrictionTMFactory;
    let I_SecurityTokenRegistryProxy;
    let P_LockUpVolumeRestrictionTM;
    let I_GeneralTransferManagerFactory;
    let I_LockUpVolumeRestrictionTMFactory;
    let I_GeneralPermissionManager;
    let I_LockUpVolumeRestrictionTM;
    let I_GeneralTransferManager;
    let I_ModuleRegistryProxy;
    let I_ModuleRegistry;
    let I_FeatureRegistry;
    let I_SecurityTokenRegistry;
    let I_STRProxied;
    let I_MRProxied;
    let I_STFactory;
    let I_SecurityToken;
    let I_PolyToken;
    let I_PolymathRegistry;
    let I_SecurityToken_div;
    let I_GeneralTransferManager_div;
    let I_LockUpVolumeRestrictionTM_div;

    // SecurityToken Details
    const name = "Team";
    const symbol = "sap";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";

    const name2 = "Core";
    const symbol2 = "Core";

    // Module key
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;

    let temp;

    // Initial fee for ticker registry and security token registry
    const initRegFee = web3.utils.toWei("250");

    before(async() => {
        // Accounts setup
        account_polymath = accounts[0];
        account_issuer = accounts[1];

        token_owner = account_issuer;

        account_investor1 = accounts[7];
        account_investor2 = accounts[8];
        account_investor3 = accounts[9];

        let instances = await setUpPolymathNetwork(account_polymath, token_owner);

        [
            I_PolymathRegistry,
            I_PolyToken,
            I_FeatureRegistry,
            I_ModuleRegistry,
            I_ModuleRegistryProxy,
            I_MRProxied,
            I_GeneralTransferManagerFactory,
            I_STFactory,
            I_SecurityTokenRegistry,
            I_SecurityTokenRegistryProxy,
            I_STRProxied
        ] = instances;

        // STEP 4(c): Deploy the LockUpVolumeRestrictionTMFactory
        [I_LockUpVolumeRestrictionTMFactory] = await deployLockupVolumeRTMAndVerified(account_polymath, I_MRProxied, I_PolyToken.address, 0);
        // STEP 4(d): Deploy the LockUpVolumeRestrictionTMFactory
        [P_LockUpVolumeRestrictionTMFactory] = await deployLockupVolumeRTMAndVerified(account_polymath, I_MRProxied, I_PolyToken.address, web3.utils.toWei("500"));

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${I_PolymathRegistry.address}
        SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.address}
        SecurityTokenRegistry:             ${I_SecurityTokenRegistry.address}
        ModuleRegistry:                    ${I_ModuleRegistry.address}
        ModuleRegistryProxy:               ${I_ModuleRegistryProxy.address}
        FeatureRegistry:                   ${I_FeatureRegistry.address}

        STFactory:                         ${I_STFactory.address}
        GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.address}

        LockupVolumeRestrictionTransferManagerFactory:  
                                           ${I_LockUpVolumeRestrictionTMFactory.address}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async() => {

        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let tx = await I_STRProxied.registerTicker(token_owner, symbol, contact, { from : token_owner });
            assert.equal(tx.logs[0].args._owner, token_owner);
            assert.equal(tx.logs[0].args._ticker, symbol.toUpperCase());
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let _blockNo = latestBlock();
            let tx = await I_STRProxied.generateSecurityToken(name, symbol, tokenDetails, false, { from: token_owner });

            // Verify the successful generation of the security token
            assert.equal(tx.logs[1].args._ticker, symbol.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken = SecurityToken.at(tx.logs[1].args._securityTokenAddress);

            const log = await promisifyLogWatch(I_SecurityToken.ModuleAdded({from: _blockNo}), 1);

            // Verify that GeneralTransferManager module get added successfully or not
            assert.equal(log.args._types[0].toNumber(), 2);
            assert.equal(
                web3.utils.toAscii(log.args._name)
                .replace(/\u0000/g, ''),
                "GeneralTransferManager"
            );
        });

        it("Should intialize the auto attached modules", async () => {
          let moduleData = (await I_SecurityToken.getModulesByType(2))[0];
          I_GeneralTransferManager = GeneralTransferManager.at(moduleData);
        });


        it("Should register another ticker before the generation of new security token", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let tx = await I_STRProxied.registerTicker(token_owner, symbol2, contact, { from : token_owner });
            assert.equal(tx.logs[0].args._owner, token_owner);
            assert.equal(tx.logs[0].args._ticker, symbol2.toUpperCase());
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let _blockNo = latestBlock();
            let tx = await I_STRProxied.generateSecurityToken(name2, symbol2, tokenDetails, true, { from: token_owner });

            // Verify the successful generation of the security token
            assert.equal(tx.logs[1].args._ticker, symbol2.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken_div = SecurityToken.at(tx.logs[1].args._securityTokenAddress);

            const log = await promisifyLogWatch(I_SecurityToken_div.ModuleAdded({from: _blockNo}), 1);

            // Verify that GeneralTransferManager module get added successfully or not
            assert.equal(log.args._types[0].toNumber(), 2);
            assert.equal(
                web3.utils.toAscii(log.args._name)
                .replace(/\u0000/g, ''),
                "GeneralTransferManager"
            );
        });

        it("Should intialize the auto attached modules", async () => {
          let moduleData = (await I_SecurityToken_div.getModulesByType(2))[0];
          I_GeneralTransferManager_div = GeneralTransferManager.at(moduleData);
        });


    });

    describe("Buy tokens using on-chain whitelist and test locking them up and attempting to transfer", async() => {

        it("Should Buy the tokens from non-divisible", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor1,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(10),
                true,
                {
                    from: account_issuer
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor1.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(5000);

            // Mint some tokens
            await I_SecurityToken.mint(account_investor1, web3.utils.toWei('2', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor1)).toNumber(),
                web3.utils.toWei('2', 'ether')
            );
        });

        it("Should Buy the tokens from the divisible token", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager_div.modifyWhitelist(
                account_investor1,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(10),
                true,
                {
                    from: account_issuer
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor1.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(5000);

            // Mint some tokens
            await I_SecurityToken_div.mint(account_investor1, web3.utils.toWei('2', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken_div.balanceOf(account_investor1)).toNumber(),
                web3.utils.toWei('2', 'ether')
            );
        });

        it("Should Buy some more tokens from non-divisible tokens", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor2,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(10),
                true,
                {
                    from: account_issuer
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor2.toLowerCase(), "Failed in adding the investor in whitelist");

            // Mint some tokens
            await I_SecurityToken.mint(account_investor2, web3.utils.toWei('10', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor2)).toNumber(),
                web3.utils.toWei('10', 'ether')
            );
        });

        it("Should unsuccessfully attach the LockUpVolumeRestrictionTM factory with the security token -- failed because Token is not paid", async () => {
            await I_PolyToken.getTokens(web3.utils.toWei("500", "ether"), token_owner);
            await catchRevert(
                 I_SecurityToken.addModule(P_LockUpVolumeRestrictionTMFactory.address, 0, web3.utils.toWei("500", "ether"), 0, { from: token_owner })
            )
        });

        it("Should successfully attach the LockUpVolumeRestrictionTM factory with the security token", async () => {
            let snapId = await takeSnapshot();
            await I_PolyToken.transfer(I_SecurityToken.address, web3.utils.toWei("500", "ether"), {from: token_owner});
            const tx = await I_SecurityToken.addModule(P_LockUpVolumeRestrictionTMFactory.address, 0, web3.utils.toWei("500", "ether"), 0, { from: token_owner });
            assert.equal(tx.logs[3].args._types[0].toNumber(), transferManagerKey, "LockUpVolumeRestrictionTMFactory doesn't get deployed");
            assert.equal(
                web3.utils.toAscii(tx.logs[3].args._name)
                .replace(/\u0000/g, ''),
                "LockupVolumeRestrictionTM",
                "LockUpVolumeRestrictionTM module was not added"
            );
            P_LockUpVolumeRestrictionTM = LockUpVolumeRestrictionTM.at(tx.logs[3].args._module);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the LockUpVolumeRestrictionTMFactory with the non-divisible security token", async () => {
            const tx = await I_SecurityToken.addModule(I_LockUpVolumeRestrictionTMFactory.address, 0, 0, 0, { from: token_owner });
            assert.equal(tx.logs[2].args._types[0].toNumber(), transferManagerKey, "LockUpVolumeRestrictionTMFactory doesn't get deployed");
            assert.equal(
                web3.utils.toAscii(tx.logs[2].args._name)
                .replace(/\u0000/g, ''),
                "LockupVolumeRestrictionTM",
                "LockUpVolumeRestrictionTM module was not added"
            );
            I_LockUpVolumeRestrictionTM = LockUpVolumeRestrictionTM.at(tx.logs[2].args._module);
        });

        it("Should successfully attach the LockUpVolumeRestrictionTMFactory with the divisible security token", async () => {
            const tx = await I_SecurityToken_div.addModule(I_LockUpVolumeRestrictionTMFactory.address, 0, 0, 0, { from: token_owner });
            assert.equal(tx.logs[2].args._types[0].toNumber(), transferManagerKey, "LockUpVolumeRestrictionTMFactory doesn't get deployed");
            assert.equal(
                web3.utils.toAscii(tx.logs[2].args._name)
                .replace(/\u0000/g, ''),
                "LockupVolumeRestrictionTM",
                "LockUpVolumeRestrictionTM module was not added"
            );
            I_LockUpVolumeRestrictionTM_div = LockUpVolumeRestrictionTM.at(tx.logs[2].args._module);
        });

        it("Add a new token holder", async() => {

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor3,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(10),
                true,
                {
                    from: account_issuer
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor3.toLowerCase(), "Failed in adding the investor in whitelist");

            // Add the Investor in to the whitelist
            // Mint some tokens
            await I_SecurityToken.mint(account_investor3, web3.utils.toWei('10', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor3)).toNumber(),
                web3.utils.toWei('10', 'ether')
            );
        });

        it("Should pause the tranfers at transferManager level", async() => {
            let tx = await I_LockUpVolumeRestrictionTM.pause({from: token_owner});
        });

        it("Should still be able to transfer between existing token holders up to limit", async() => {
            // Transfer Some tokens between the investor
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1', 'ether'), { from: account_investor2 });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor1)).toNumber(),
                web3.utils.toWei('3', 'ether')
            );
        });

        it("Should unpause the tranfers at transferManager level", async() => {
            await I_LockUpVolumeRestrictionTM.unpause({from: token_owner});
        });

        it("Should prevent the creation of a lockup with bad parameters where the lockupAmount is zero", async() => {
            // create a lockup
            // this will generate an exception because the lockupAmount is zero
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    0,
                    latestTime() + + duration.seconds(1),
                    duration.seconds(400000),
                    duration.seconds(100000),
                    { 
                        from: token_owner
                    }
                )
            )
        });

        it("Should prevent the creation of a lockup with bad parameters where the releaseFrequencySeconds is zero", async() => {
            // create a lockup
            // this will generate an exception because the releaseFrequencySeconds is zero
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    web3.utils.toWei('1', 'ether'),
                    latestTime() + duration.seconds(1),
                    duration.seconds(400000),
                    0,
                    {
                         from: token_owner
                    }
                )
            );
        });

        it("Should prevent the creation of a lockup with bad parameters where the lockUpPeriodSeconds is zero", async() => {
            // create a lockup
            // this will generate an exception because the lockUpPeriodSeconds is zero
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    web3.utils.toWei('1', 'ether'),
                    latestTime() + duration.seconds(1),
                    0,
                    duration.seconds(100000),
                    {
                         from: token_owner
                    }
                )
            );
        });


        it("Should prevent the creation of a lockup with bad parameters where the total amount to be released is more granular than allowed by the token", async() => {
            // create a lockup
            // this will generate an exception because we're locking up 5e17 tokens but the granularity is 5e18 tokens
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    web3.utils.toWei('0.5', 'ether'),
                    latestTime() + + duration.seconds(1),
                    duration.seconds(400000),
                    duration.seconds(100000),
                    { 
                        from: token_owner
                    }
                )
            );
        });

        it("Should allow the creation of a lockup where the lockup amount is divisible" , async() => {
            // create a lockup
            let tx = await I_LockUpVolumeRestrictionTM_div.addLockUp(
                    account_investor1,
                    web3.utils.toWei('0.5', 'ether'),
                    latestTime() + duration.seconds(1),
                    duration.seconds(400000),
                    duration.seconds(100000),
                    { 
                        from: token_owner
                    }
            );
            assert.equal(tx.logs[0].args.userAddress, account_investor1);
            assert.equal((tx.logs[0].args.lockupAmount).toNumber(), web3.utils.toWei('0.5', 'ether'));
        });

        it("Should allow the creation of a lockup where the lockup amount is prime no", async() => {
            // create a lockup
            let tx = await I_LockUpVolumeRestrictionTM_div.addLockUp(
                    account_investor1,
                    web3.utils.toWei('64951', 'ether'),
                    latestTime() + duration.seconds(1),
                    duration.seconds(400000),
                    duration.seconds(100000),
                    { 
                        from: token_owner
                    }
            );
            assert.equal(tx.logs[0].args.userAddress, account_investor1);
            assert.equal((tx.logs[0].args.lockupAmount).toNumber(), web3.utils.toWei('64951', 'ether'));
        });

        it("Should prevent the creation of a lockup with bad parameters where the lockUpPeriodSeconds is not evenly divisible by releaseFrequencySeconds", async() => {

            // balance should be 9000000000000000000 here (9 eth)
            let balance = await I_SecurityToken.balanceOf(account_investor2)


            // create a lockup
            // over 17 seconds total, with 4 periods.
            // this will generate an exception because 17 is not evenly divisble by 4.
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    web3.utils.toWei('4', 'ether'),
                    latestTime(),
                    17,
                    4,
                    {
                        from: token_owner
                    }
                )
            );
        });

        it("Should prevent the creation of a lockup with bad parameters where the total amount being locked up isn't evenly divisible by the number of total periods", async() => {

            // create a lockup for a balance of 1 eth
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    web3.utils.toWei('1', 'ether'),
                    latestTime(),
                    duration.seconds(400000),
                    duration.seconds(100000),
                    { 
                        from: token_owner
                    }
                )
            );
        });

        it("Should prevent the creation of a lockup with bad parameters where the amount to be released per period is too granular for the token", async() => {

            // balance should be 9000000000000000000 here (9 eth)
            let balance = await I_SecurityToken.balanceOf(account_investor2)
        
            // create a lockup for their entire balance
            // over 16 seconds total, with 4 periods of 4 seconds each.
            // this will generate an exception because 9000000000000000000 / 4 = 2250000000000000000 but the token granularity is 1000000000000000000
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUp(
                    account_investor2,
                    balance,
                    latestTime() + duration.seconds(1),
                    16,
                    4,
                    {
                        from: token_owner
                    }
                )
            );
           
        });

        it("Should prevent the transfer of tokens in a lockup", async() => {

            let balance = await I_SecurityToken.balanceOf(account_investor2)
            console.log("balance", balance.dividedBy(new BigNumber(1).times(new BigNumber(10).pow(18))).toNumber());
            // create a lockup for their entire balance
            // over 12 seconds total, with 3 periods of 4 seconds each.
            await I_LockUpVolumeRestrictionTM.addLockUp(
                account_investor2,
                balance,
                latestTime() + duration.seconds(1),
                60,
                20,
                {
                    from: token_owner
                }
            );
            await increaseTime(2);
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor2, 0);
            console.log("Amount get unlocked:", (tx[4].toNumber()));
            await catchRevert(
                I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1', 'ether'), { from: account_investor2 })
            );
        });

        it("Should prevent the transfer of tokens if the amount is larger than the amount allowed by lockups", async() => {
            // wait 20 seconds
            await increaseTime(duration.seconds(20));
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor2, 0);
            console.log("Amount get unlocked:", (tx[4].toNumber()));
            await catchRevert(
                I_SecurityToken.transfer(account_investor1, web3.utils.toWei('4', 'ether'), { from: account_investor2 })
            );
        });

        it("Should allow the transfer of tokens in a lockup if a period has passed", async() => {
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor2, 0);
            console.log("Amount get unlocked:", (tx[4].toNumber()));
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1', 'ether'), { from: account_investor2 });
        });

        it("Should again transfer of tokens in a lockup if a period has passed", async() => {
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor2, 0);
            console.log("Amount get unlocked:", (tx[4].toNumber()));
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1', 'ether'), { from: account_investor2 });
        });

        it("Should allow the transfer of more tokens in a lockup if another period has passed", async() => {

            // wait 20 more seconds + 1 to get rid of same block time
            await increaseTime(duration.seconds(21));
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor2, 0);
            console.log("Amount get unlocked:", (tx[4].toNumber()));
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('2', 'ether'), { from: account_investor2 });
        });

        it("Buy more tokens from secondary market to investor2", async() => {
             // Mint some tokens
             await I_SecurityToken.mint(account_investor2, web3.utils.toWei('5', 'ether'), { from: token_owner });

             assert.equal(
                 (await I_SecurityToken.balanceOf(account_investor2)).toNumber(),
                 web3.utils.toWei('10', 'ether')
             );
        })

        it("Should allow transfer for the tokens that comes from secondary market + unlocked tokens", async() => {

            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('4', 'ether'), { from: account_investor2 });
            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor2)).toNumber(),
                web3.utils.toWei('6', 'ether')
            );
        });

        it("Should allow the transfer of all tokens in a lockup if the entire lockup has passed", async() => {

            let balance = await I_SecurityToken.balanceOf(account_investor2)

            // wait 20 more seconds + 1 to get rid of same block time
            await increaseTime(duration.seconds(20));

            await I_SecurityToken.transfer(account_investor1, balance, { from: account_investor2 });
            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor2)).toNumber(),
                web3.utils.toWei('0', 'ether')
            );
        });

        it("Should fail to add the multiple lockups -- because array length mismatch", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUpMulti(
                    [account_investor3],
                    [web3.utils.toWei("6", "ether"), web3.utils.toWei("3", "ether")],
                    [latestTime() + duration.seconds(1), latestTime() + duration.seconds(21)],
                    [60, 45],
                    [20, 15],
                    {
                        from: token_owner
                    }
                )
            );
        })

        it("Should fail to add the multiple lockups -- because array length mismatch", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUpMulti(
                    [account_investor3, account_investor3],
                    [],
                    [latestTime() + duration.seconds(1), latestTime() + duration.seconds(21)],
                    [60, 45],
                    [20, 15],
                    {
                        from: token_owner
                    }
                )
            );
        })

        it("Should fail to add the multiple lockups -- because array length mismatch", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.addLockUpMulti(
                    [account_investor3, account_investor3],
                    [web3.utils.toWei("6", "ether"), web3.utils.toWei("3", "ether")],
                    [latestTime() + duration.seconds(1), latestTime() + duration.seconds(21)],
                    [60, 45, 50],
                    [20, 15],
                    {
                        from: token_owner
                    }
                )
            );
        })

        it("Should fail to add the multiple lockups -- because array length mismatch", async() => {
            await catchRevert( 
                I_LockUpVolumeRestrictionTM.addLockUpMulti(
                    [account_investor3, account_investor3],
                    [web3.utils.toWei("6", "ether"), web3.utils.toWei("3", "ether")],
                    [latestTime() + duration.seconds(1), latestTime() + duration.seconds(21)],
                    [60, 45, 50],
                    [20, 15, 10],
                    {
                        from: token_owner
                    }
                )
            );
        })

        it("Should add the multiple lockup to a address", async() => {
            await I_LockUpVolumeRestrictionTM.addLockUpMulti(
                [account_investor3, account_investor3],
                [web3.utils.toWei("6", "ether"), web3.utils.toWei("3", "ether")],
                [latestTime() + duration.seconds(1), latestTime() + duration.seconds(21)],
                [60, 45],
                [20, 15],
                {
                    from: token_owner
                }
            );

            await increaseTime(1);
            let tx = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor3, 0);
            let tx2 = await I_LockUpVolumeRestrictionTM.getLockUp.call(account_investor3, 1);
            console.log("Total Amount get unlocked:", (tx[4].toNumber()) + (tx2[4].toNumber()));
            await catchRevert(
                I_SecurityToken.transfer(account_investor2, web3.utils.toWei('2', 'ether'), { from: account_investor3 })
            );

        });

        it("Should transfer the tokens after period get passed", async() => {
            // increase 20 sec that makes 1 period passed
            // 2 from a period and 1 is already unlocked
            await increaseTime(21);
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('3'), { from: account_investor3 })
        })

        it("Should transfer the tokens after passing another period of the lockup", async() => {
            // increase the 15 sec that makes first period of another lockup get passed
            // allow 1 token to transfer
            await increaseTime(15);
            // first fail because 3 tokens are not in unlocked state
            await catchRevert(
                I_SecurityToken.transfer(account_investor1, web3.utils.toWei('3'), { from: account_investor3 })
            )
            // second txn will pass because 1 token is in unlocked state
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1'), { from: account_investor3 })
        });

        it("Should transfer the tokens from both the lockup simultaneously", async() => {
            // Increase the 20 sec (+ 1 to mitigate the block time) that unlocked another 2 tokens from the lockup 1 and simultaneously unlocked 1
            // more token from the lockup 2 
            await increaseTime(21);
            
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('3'), { from: account_investor3 })
            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor3)).toNumber(),
                web3.utils.toWei('3', 'ether')
            );
        });

        it("Should remove multiple lockup --failed because of bad owner", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.removeLockUpMulti(
                    [account_investor3, account_investor3],
                    [0,1],
                    {
                        from: account_polymath
                    }
                )
            ); 
        });

        it("Should remove the multiple lockup -- failed because of invalid index", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.removeLockUpMulti(
                    [account_investor3, account_investor3],
                    [0,3],
                    {
                        from: account_polymath
                    }
                )
            ); 
        })

        it("Should remove the multiple lockup", async() => {
            await I_LockUpVolumeRestrictionTM.removeLockUpMulti(
                [account_investor3, account_investor3],
                [1,0],
                {
                    from: token_owner
                }
            )
            // do the free transaction now
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('3'), { from: account_investor3 })
        });

        it("Should fail to modify the lockup -- because of bad owner", async() => {
            await I_SecurityToken.mint(account_investor3, web3.utils.toWei("9"), {from: token_owner});
           
            let tx = await I_LockUpVolumeRestrictionTM.addLockUp(
                account_investor3,
                web3.utils.toWei("9"),
                latestTime() + duration.minutes(5),                
                60,
                20,
                { 
                    from: token_owner
                }
            );
            temp = (tx.logs[0].args.lockupIndex).toNumber();
            await catchRevert(
                 // edit the lockup
                I_LockUpVolumeRestrictionTM.modifyLockUp(
                    account_investor3,
                    web3.utils.toWei("9"),
                    latestTime() + duration.seconds(1),                
                    60,
                    20,
                    (tx.logs[0].args.lockupIndex).toNumber(),
                    { 
                        from: account_polymath
                    }
                )
            )
        })

        it("Modify the lockup when startTime is in past -- failed because startTime is in the past", async() => {
            await catchRevert(
                // edit the lockup
               I_LockUpVolumeRestrictionTM.modifyLockUp(
                   account_investor3,
                   web3.utils.toWei("9"),
                   latestTime() - duration.seconds(50),                
                   60,
                   20,
                   temp,
                   { 
                       from: token_owner
                   }
               )
           )
        })

        it("Modify the lockup when startTime is in past -- failed because of invalid index", async() => {
            await catchRevert(
                // edit the lockup
               I_LockUpVolumeRestrictionTM.modifyLockUp(
                   account_investor3,
                   web3.utils.toWei("9"),
                   latestTime() + duration.seconds(50),                
                   60,
                   20,
                   6,
                   { 
                       from: token_owner
                   }
               )
           )
        })

        it("should successfully modify the lockup", async() => {
                // edit the lockup
            await I_LockUpVolumeRestrictionTM.modifyLockUp(
                   account_investor3,
                   web3.utils.toWei("9"),
                   latestTime() + duration.seconds(50),                
                   60,
                   20,
                   temp,
                   { 
                       from: token_owner
                   }
            );
        })

        it("Should prevent the transfer of tokens in an edited lockup", async() => {

            // balance here should be 12000000000000000000 (12e18 or 12 eth)
            let balance = await I_SecurityToken.balanceOf(account_investor1)

            console.log("balance", balance.dividedBy(new BigNumber(1).times(new BigNumber(10).pow(18))).toNumber());

            // create a lockup for their entire balance
            // over 16 seconds total, with 4 periods of 4 seconds each.
            await I_LockUpVolumeRestrictionTM.addLockUp(
                account_investor1,
                balance,
                latestTime() + duration.minutes(5),                
                60,
                20,
                { 
                    from: token_owner
                }
            );

            await catchRevert(
                I_SecurityToken.transfer(account_investor2, web3.utils.toWei('1', 'ether'), { from: account_investor1 })
            );

            // check and get the lockup
            let lockUpCount = await I_LockUpVolumeRestrictionTM.getLockUpsLength(account_investor1);
            assert.equal(lockUpCount, 1)

            let lockUp = await I_LockUpVolumeRestrictionTM.getLockUp(account_investor1, 0);
            // elements in lockup array are uint lockUpPeriodSeconds, uint releaseFrequencySeconds, uint startTime, uint totalAmount
            assert.equal(
                lockUp[0].dividedBy(new BigNumber(1).times(new BigNumber(10).pow(18))).toNumber(),
                balance.dividedBy(new BigNumber(1).times(new BigNumber(10).pow(18))).toNumber()
            );
            assert.equal(lockUp[2].toNumber(), 60);
            assert.equal(lockUp[3].toNumber(), 20);
            assert.equal(lockUp[4].toNumber(), 0);

            // edit the lockup
            temp = latestTime() + duration.seconds(1);
            await I_LockUpVolumeRestrictionTM.modifyLockUp(
                account_investor1,
                balance,
                temp,                
                60,
                20,
                0,
                { 
                    from: token_owner
                }
            );

            // attempt a transfer
            await catchRevert(
                I_SecurityToken.transfer(account_investor2, web3.utils.toWei('6', 'ether'), { from: account_investor1 })
            );

            // wait 20 seconds
            await increaseTime(21);

            // transfer should succeed
            await I_SecurityToken.transfer(account_investor2, web3.utils.toWei('6', 'ether'), { from: account_investor1 });

        });

        it("Modify the lockup during the lockup periods --fail because already tokens get unlocked", async() => {
            let balance = await I_SecurityToken.balanceOf(account_investor1)
            let lockUp = await I_LockUpVolumeRestrictionTM.getLockUp(account_investor1, 0);
            console.log(lockUp[4].dividedBy(new BigNumber(1).times(new BigNumber(10).pow(18))).toNumber());
            // edit the lockup
            await catchRevert(
                I_LockUpVolumeRestrictionTM.modifyLockUp(
                    account_investor1,
                    balance,
                    temp,                
                    90,
                    30,
                    0,
                    { 
                        from: token_owner
                    }
                )
            );
        });

        it("Should succesfully get the lockup - fail because array index out of bound", async() => {
            await catchRevert(
                I_LockUpVolumeRestrictionTM.getLockUp(account_investor1, 9)
            );
        })

        it("Should get configuration function signature", async() => {
            let sig = await I_LockUpVolumeRestrictionTM.getInitFunction.call();
            assert.equal(web3.utils.hexToNumber(sig), 0);
        });


        it("Should get the permission", async() => {
            let perm = await I_LockUpVolumeRestrictionTM.getPermissions.call();
            assert.equal(perm.length, 1);
            assert.equal(web3.utils.toAscii(perm[0]).replace(/\u0000/g, ''), "ADMIN")
        });

    });

    describe("LockUpVolumeRestrictionTM Transfer Manager Factory test cases", async() => {

        it("Should get the exact details of the factory", async() => {
            assert.equal(await I_LockUpVolumeRestrictionTMFactory.getSetupCost.call(),0);
            assert.equal((await I_LockUpVolumeRestrictionTMFactory.getTypes.call())[0],2);
            assert.equal(web3.utils.toAscii(await I_LockUpVolumeRestrictionTMFactory.getName.call())
                        .replace(/\u0000/g, ''),
                        "LockupVolumeRestrictionTM",
                        "Wrong Module added");
            assert.equal(await I_LockUpVolumeRestrictionTMFactory.description.call(),
                        "Manage transfers using lock ups over time",
                        "Wrong Module added");
            assert.equal(await I_LockUpVolumeRestrictionTMFactory.title.call(),
                        "Lockup Volume Restriction Transfer Manager",
                        "Wrong Module added");
            assert.equal(await I_LockUpVolumeRestrictionTMFactory.getInstructions.call(),
                        "Allows an issuer to set lockup periods for user addresses, with funds distributed over time. Init function takes no parameters.",
                        "Wrong Module added");
            assert.equal(await I_LockUpVolumeRestrictionTMFactory.version.call(), "1.0.0");
        });

        it("Should get the tags of the factory", async() => {
            let tags = await I_LockUpVolumeRestrictionTMFactory.getTags.call();
            assert.equal(web3.utils.toAscii(tags[0]).replace(/\u0000/g, ''), "Volume");
        });
    });

});
