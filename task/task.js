task("mockup", "create sample data").setAction(async () => {
    [owner, ...addrs] = await ethers.getSigners();
    // We get the contract to deploy
    const Balloot = await ethers.getContractFactory("Ballot");
    const contract = await Balloot.deploy("0xCC0f1E5e50dc49E774B1AB1b6d768B399ea403EF");

    await contract.deployed();

    console.log("Ballot deployed to:", contract.address);

    const CANDIDATE_0 = "CANDIDATE_0";
    const CANDIDATE_1 = "CANDIDATE_1";
    const CANDIDATE_2 = "CANDIDATE_2";

    const ADDRESS_0 = "0x84adC14E42EE7c0542e80345246248e1639F5a48";
    const ADDRESS_1 = "0x585Eb63c67308544b115894a2648B3Fa9DFE92b8";
    const ADDRESS_2 = "0x4Ef3729F66120A9E4dE9A3dE0E4A2FC4aa42e2B6";

    const startTime1 = parseInt(new Date().getTime()/1000) - (60*60*24*3);
    let tx = await contract.createVote("VOTE_1", startTime1)
    await tx.wait(0);

    // Add candidates to VOTE_1
    tx = await contract.addCandidate(0, CANDIDATE_0, ADDRESS_0);
    await tx.wait();
    tx = await contract.addCandidate(0, CANDIDATE_1, ADDRESS_1);
    await tx.wait();
    tx = await contract.addCandidate(0, CANDIDATE_2, ADDRESS_2);
    await tx.wait();

    // Check getCandidateList
    result = await contract.getCandidateList(0);
    console.log(`========== Candidate List ==========`);
    console.log(result);
    console.log(`====================================`);

    tx = await contract.connect(addrs[0]).vote(0, 1, {value: 1000000000000000});
    await tx.wait();
    tx = await contract.connect(addrs[1]).vote(0, 2, {value: 1000000000000000});
    await tx.wait();
    tx = await contract.connect(addrs[2]).vote(0, 2, {value: 1000000000000000});
    await tx.wait();

    // Check getWinnerId
    result = await contract.getWinnerId(0);
    console.log(`Winner Index: ${result}\n`);

    // Check getVoteInfo
    result = await contract.getVoteInfo(0);
    console.log(`Vote Info BEFORE finishing: ${result}`);

    // Check finishVote
    let contractBalance = await contract.provider.getBalance(contract.address);
    console.log(`Contract balance BEFORE finishing vote: ${contractBalance}`);

    let winnerBalance = await contract.provider.getBalance(ADDRESS_2);
    console.log(`Winner balance BEFORE finishing vote: ${ADDRESS_2}`);

    let feeTotal = await contract.feeTotal();
    console.log(`Total Fee BEFORE finishing vote: ${feeTotal}`);
    

    tx = await contract.finishVote(0);
    await tx.wait();
    console.log(`=== Finish Vote ===`);

    result = await contract.getVoteInfo(0);
    console.log(`Vote Info AFTER finishing: ${result}`);

    contractBalance = await contract.provider.getBalance(contract.address);
    console.log(`Contract balance AFTER finishing vote: ${contractBalance}`);

    winnerBalance = await contract.provider.getBalance(ADDRESS_2);
    console.log(`Winner balance AFTER finishing vote: ${winnerBalance}`);

    feeTotal = await contract.feeTotal();
    console.log(`Total Fee AFTER finishing vote: ${feeTotal}`);
    
    // Check withdrawFee
    const adminWallet = await contract.adminWallet();
    adminBalance = await contract.provider.getBalance(adminWallet);
    console.log(`\nadmin wallet balance Before withdrawing: ${adminBalance}`);

    console.log(`=== Withdarw Fee(contract) ===`);
    tx = await contract.withdrawFee();
    await tx.wait();

    feeTotal = await contract.feeTotal();
    console.log(`Total Fee AFTER withdrawing: ${feeTotal}`);

    adminBalance = await contract.provider.getBalance(adminWallet);
    console.log(`admin wallet balance AFTER withdrawing: ${adminBalance}`);
    

    // Check getVoterList
    result = await contract.getVoterList(0);
    console.log(`\n======= Voter List =======`);
    console.log(result);
    console.log(`============================`);

    // Check getCandidateScoreList
    result = await contract.getCandidateScoreList(0);
    console.log(`\n===== Candidate Score List =====`);
    console.log(result);
    console.log(`==================================`);

    // Check getVoterCandidateMatch
    result = await contract.getVoterCandidateMatch(0);
    console.log(`\n===== Voter Candidate List =====`);
    console.log(result);
    console.log(`==================================`);
});

module.exports = {};