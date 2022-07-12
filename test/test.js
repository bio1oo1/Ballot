const { SignerWithAddress } = require("@nomiclabs/hardhat-ethers/signers");
const { expect } = require("chai");
const { getCreate2Address } = require("ethers/lib/utils");
const { ethers } = require("hardhat");

describe("Ballot", function () {

  let contract;
  let owner, addrs;

  beforeEach(async function () {
    // Create the smart contract object to test from
    [owner, ...addrs] = await ethers.getSigners();

    const Ballot = await ethers.getContractFactory("Ballot");
    contract = await Ballot.deploy("0xCC0f1E5e50dc49E774B1AB1b6d768B399ea403EF");
    await contract.deployed();
  });

  it("Check require of finishVote", async function () {
    const startTime = parseInt(new Date().getTime()/1000) - (60*60*24*2);
    tx = await contract.createVote("VOTE_0", startTime);
    await tx.wait();
    await expect(contract.connect(addrs[0]).finishVote(0)).to.be.revertedWith('Vote is still live');
  });

  it("Check all workflow", async function () {

    const CANDIDATE_0 = "CANDIDATE_0";
    const CANDIDATE_1 = "CANDIDATE_1";
    const CANDIDATE_2 = "CANDIDATE_2";

    const ADDRESS_0 = "0x84adC14E42EE7c0542e80345246248e1639F5a48";
    const ADDRESS_1 = "0x585Eb63c67308544b115894a2648B3Fa9DFE92b8";
    const ADDRESS_2 = "0x4Ef3729F66120A9E4dE9A3dE0E4A2FC4aa42e2B6";

    // Chack createVote
    await expect(contract.createVote("", 1657550155)).to.be.revertedWith('Name of vote is empty');
    await expect(contract.createVote("VOTE_NAME", 0)).to.be.revertedWith('Start time of vote cannot be zero');
    await expect(contract.connect(addrs[0]).createVote("VOTE_NAME", 1657550155)).to.be.reverted; //onlyOwner

    const startTime0 = parseInt(new Date().getTime()/1000) + 100;
    let tx = await contract.createVote("VOTE_0", startTime0);
    await tx.wait();
    expect(await contract.voteCount()).to.equal(1);

    const startTime1 = parseInt(new Date().getTime()/1000) - (60*60*24*3);
    await expect(contract.createVote("VOTE_1", startTime1))
          .to.emit(contract, 'CreateVote')
          .withArgs(1, "VOTE_1", startTime1);
    
    // Check getCandidateList if no candidate
    let result = await contract.getCandidateList(1);
    expect(result.length).to.equal(0);
    
    // Check addCandidate
    await expect(contract.addCandidate(2, "CANDIDATE_NAME", ADDRESS_0)).to.be.revertedWith('Index of vote is bigger than count');
    await expect(contract.addCandidate(0, "", ADDRESS_0)).to.be.revertedWith('Name of candidate is empty');
    await expect(contract.addCandidate(0, "CANDIDATE_NAME", ethers.constants.AddressZero)).to.be.revertedWith('Invalid address');
    await expect(contract.connect(addrs[0]).addCandidate(1, CANDIDATE_0, ADDRESS_0)).to.be.reverted; //onlyOwner

    // Add candidates to VOTE_1
    tx = await contract.addCandidate(1, CANDIDATE_0, ADDRESS_0);
    await tx.wait();
    tx = await contract.addCandidate(1, CANDIDATE_1, ADDRESS_1);
    await tx.wait();
    tx = await contract.addCandidate(1, CANDIDATE_2, ADDRESS_2);
    await tx.wait();

    // Check getCandidateList
    result = await contract.getCandidateList(1);
    expect(result[0][0]).to.equal(CANDIDATE_0);
    expect(result[0][1]).to.equal(ADDRESS_0);
    expect(result[1][0]).to.equal(CANDIDATE_1);
    expect(result[1][1]).to.equal(ADDRESS_1);
    expect(result[2][0]).to.equal(CANDIDATE_2);
    expect(result[2][1]).to.equal(ADDRESS_2);

    // Check vote
    await expect(contract.vote(3, 0, {value: 0})).to.be.revertedWith('Index of vote is bigger than count');
    await expect(contract.vote(0, 0, {value: 0})).to.be.revertedWith('Index of candidate is bigger than count');

    // Add candidates to VOTE_0
    await expect(contract.addCandidate(0, CANDIDATE_0, ADDRESS_0))
          .to.emit(contract, 'AddCandidate')
          .withArgs(0, 0, CANDIDATE_0, ADDRESS_0);
    await expect(contract.vote(0, 0, {value: 0})).to.be.revertedWith('Vote has not started yet');
    await expect(contract.vote(1, 0, {value: 90})).to.be.revertedWith('Vote Fee is not enough');

    await expect(contract.connect(addrs[0]).vote(1, 1, {value: 1000000000000000}))
          .to.emit(contract, 'VoteCandidate')
          .withArgs(addrs[0].address, 1, 1);

    await expect(contract.connect(addrs[0]).vote(1, 0, {value: 1000000000000000})).to.be.revertedWith('Sender already voted');

    tx = await contract.connect(addrs[1]).vote(1, 2, {value: 1000000000000000});
    await tx.wait();
    tx = await contract.connect(addrs[2]).vote(1, 2, {value: 1000000000000000});
    await tx.wait();
    

    // Check getWinnerId
    expect(await contract.getWinnerId(1)).to.equal(2);

    // Check getVoteInfo
    result = await contract.getVoteInfo(1);
    expect(result[0]).to.equal("VOTE_1");
    expect(result[1]).to.equal(false);
    expect(result[2]).to.equal(ethers.BigNumber.from(3));
    expect(result[3]).to.equal(ethers.BigNumber.from(3));

    await expect(contract.connect(addrs[0]).withdrawFee()).to.be.reverted;
    await expect(contract.withdrawFee()).to.be.revertedWith('There is not any balance');

    // Check finishVote
    let contractBalance = await contract.provider.getBalance(contract.address);
    expect(contractBalance).to.equal(3000000000000000);
    expect(await contract.feeTotal()).to.equal(0);
    
    tx = await contract.finishVote(1);
    await tx.wait();
    const winnerBalance = await contract.provider.getBalance(ADDRESS_2);
    expect(await contract.provider.getBalance(contract.address)).to.equal(contractBalance - winnerBalance);
    expect(await contract.provider.getBalance(contract.address)).to.equal(300000000000000);
    
    result = await contract.getVoteInfo(1);
    expect(result[1]).to.equal(true);
    expect(await contract.feeTotal()).to.equal(300000000000000);

    // Check withdrawFee
    tx = await contract.withdrawFee();
    await tx.wait();
    expect(await contract.feeTotal()).to.equal(0);
    expect(await contract.provider.getBalance(contract.address)).to.equal(0);

    // Check getVoterList
    result = await contract.getVoterList(1);
    expect(result[0]).to.equal(addrs[0].address);
    expect(result[1]).to.equal(addrs[1].address);
    expect(result[2]).to.equal(addrs[2].address);

    // Check getCandidateScoreList
    result = await contract.getCandidateScoreList(1);
    expect(result[0]).to.equal(0);
    expect(result[1]).to.equal(1);
    expect(result[2]).to.equal(2);

    // Check getVoterCandidateMatch
    result = await contract.getVoterCandidateMatch(1);
    expect(result[0][0]).to.equal(addrs[0].address);
    expect(result[0][1]).to.equal(addrs[1].address);
    expect(result[0][2]).to.equal(addrs[2].address);
    expect(result[1][0]).to.equal(1);
    expect(result[1][1]).to.equal(2);
    expect(result[1][2]).to.equal(2);
  });

  it("Check setAdminWallet", async function () {
    await expect(contract.connect(addrs[0]).setAdminWallet("0x77fc746a68bFa56812b96f9686495efFF6F39364")).to.be.reverted;
    await expect(contract.setAdminWallet(ethers.constants.AddressZero)).to.be.reverted;

    const tx = await contract.setAdminWallet("0x77fc746a68bFa56812b96f9686495efFF6F39364");
    await tx.wait();
    expect(await contract.adminWallet()).to.equal("0x77fc746a68bFa56812b96f9686495efFF6F39364");
  });
});
  