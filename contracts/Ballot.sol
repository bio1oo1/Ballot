// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

/**
* @title Ballot
* @author bio.star1001@gmail.com
*/
contract Ballot is Ownable, ReentrancyGuard{

    // Candidate struct
    struct Candidate {
        string name;
        address wallet;
    }

    // Vote struct
    struct Vote {
        string name;                                        // name of vote
        bool isFinished;                                    // true: vote is finished & winner got reward
        uint256 startTime;                                  // vote starting time (second)
        address[] voterList;                                // array of voters
        uint256 candidateCount;                             // a number of candidates
        mapping (uint256 => Candidate) candidateMap;        // (index=>candidate) same as candidate array
        mapping (address => uint256) voterCandidateMap;     // (voter address => candidate index+1) : the reason for using index+1 is to verify voter was already voted or not easily
        mapping (uint256 => uint256) candidateScore;        // (candidate index => candidate score)
    }

    mapping (uint256 => Vote) voteMap;                      // (index => vote) same as vote array
    uint256 public voteCount;                               // a number of votes
    uint256 public voteTime = 3 days;                       // voting time
    uint256 public voteFee = 0.001 ether;                   // vote fee
    uint256 public feePercent = 10;                         // fee for the contract owner. remaining percent for each vote will be withdrawn to the winner of vote
    uint256 public feeTotal;                                // total fee that is staked in the contract
    address public adminWallet;                             // admin wallet
    
    // modifier: validate vote with vote-index
    modifier isValidVote (uint256 _vIndex) {
        require(_vIndex < voteCount, "Index of vote is bigger than count");
        _;
    }

    // modifer: validate vote with vote-index & candidate-index
    modifier isValidCandidate (uint256 _vIndex, uint256 _cIndex) {
        require(_vIndex < voteCount, "Index of vote is bigger than count");
        require(_cIndex < voteMap[_vIndex].candidateCount, "Index of candidate is bigger than count");
        _;
    }

    event CreateVote (
        uint256 _id, 
        string _name, 
        uint256 _startTime
    );
    
    event AddCandidate (
        uint256 _vIndex,
        uint256 _cIndex,
        string _cName, 
        address _cWallet
    );

    event VoteCandidate (
        address _voter,
        uint256 _vIndex,
        uint256 _cIndex
    );

    constructor (address _adminWallet) {
        adminWallet = _adminWallet;
    }

    /**
    * Create a vote (owner only)
    */
    function createVote(string memory _name, uint256 _startTime) public onlyOwner returns (uint256) {
        require(bytes(_name).length > 0, "Name of vote is empty");
        require(_startTime > 0, "Start time of vote cannot be zero");
        Vote storage newVote = voteMap[voteCount];
        newVote.name = _name;
        newVote.startTime = _startTime;
        emit CreateVote(voteCount, _name, _startTime);
        return voteCount++;
    }

    /**
    * Add a candidate to the vote (owner only)
    */
    function addCandidate(uint256 _vIndex, string memory _cName, address _cWallet) public isValidVote(_vIndex) onlyOwner returns (uint256) {
        require(bytes(_cName).length > 0, "Name of candidate is empty");
        require(_cWallet != address(0), "Invalid address");
        uint256 candidateCount = voteMap[_vIndex].candidateCount++;
        voteMap[_vIndex].candidateMap[candidateCount] = Candidate(_cName, _cWallet);
        emit AddCandidate(_vIndex, candidateCount, _cName, _cWallet);
        return candidateCount;
    }

    /**
    * Vote to one of candidates
    */
    function vote(uint256 _vIndex, uint256 _cIndex) external payable isValidCandidate(_vIndex, _cIndex) returns (uint256, uint256) {
        require(msg.sender != address(0));
        require(voteMap[_vIndex].startTime < block.timestamp, "Vote has not started yet");
        require(!voteMap[_vIndex].isFinished, "Vote was already finished");
        require(msg.value >= voteFee , "Vote Fee is not enough");
        require(voteMap[_vIndex].voterCandidateMap[msg.sender] == 0, "Sender already voted");

        voteMap[_vIndex].voterCandidateMap[msg.sender] = _cIndex + 1;
        voteMap[_vIndex].candidateScore[_cIndex]++;
        voteMap[_vIndex].voterList.push(msg.sender);

        emit VoteCandidate(msg.sender, _vIndex, _cIndex);
        
        return (_vIndex, _cIndex);
    }

    /**
    * Finish a vote
    */
    function finishVote(uint256 _vIndex) public isValidVote(_vIndex) returns (bool) {
        require(voteMap[_vIndex].startTime + voteTime <= block.timestamp, "Vote is still live");
        voteMap[_vIndex].isFinished = true;

        return withdraw(_vIndex);
    }
    
    /**
    * Withraw reward to a winner of the vote
    */
    function withdraw(uint256 _vIndex) internal isValidVote(_vIndex) nonReentrant returns (bool) {

        uint256 reward = voteFee * voteMap[_vIndex].candidateCount / 100 * (100 - feePercent);
        address winnerWallet = voteMap[_vIndex].candidateMap[getWinnerId(_vIndex)].wallet;
        (bool success, ) = winnerWallet.call{value: reward}("");
        require(success, string(abi.encodePacked("Failed to send to ", winnerWallet)));

        feeTotal += voteFee * voteMap[_vIndex].candidateCount / 100 * feePercent;

        return success;
    }

    /**
    * Withraw fee
    */
    function withdrawFee() public onlyOwner nonReentrant {
        require(feeTotal > 0, "There is not any balance");
        (bool success, ) = adminWallet.call{value: feeTotal}("");
        require(success, string(abi.encodePacked("Failed to send to ", adminWallet)));
        feeTotal = 0;
    }

    /**
    * Get index of winner
    * *** Assume that there is only ONE winner.
    */
    function getWinnerId(uint256 _vIndex) public view isValidVote(_vIndex) returns (uint256) {
        uint256 maxId;
        for (uint256 i = 0; i < voteMap[_vIndex].candidateCount; i++) {
            if (voteMap[_vIndex].candidateScore[maxId] < voteMap[_vIndex].candidateScore[i])
                maxId = i;
        }
        return maxId;
    }

    /**
    * Get vote's basic info
    * @return (name, isFinished, candidateCount, voterList.length)
    */
    function getVoteInfo(uint256 _vIndex) public view isValidVote(_vIndex) returns (string memory, bool, uint256, uint256) {
        return (voteMap[_vIndex].name, voteMap[_vIndex].isFinished, voteMap[_vIndex].candidateCount, voteMap[_vIndex].voterList.length);
    }

    /**
    * Get voter list
    * @return (voter array)
    */
    function getVoterList(uint256 _vIndex) public view isValidVote(_vIndex) returns (address[] memory) {
        return (voteMap[_vIndex].voterList);
    }

    /**
    * Get candidate list
    * @return (candidate array)
    */
    function getCandidateList(uint256 _vIndex) public view isValidVote(_vIndex) returns (Candidate[] memory) {
        uint256 count = voteMap[_vIndex].candidateCount;
        Candidate[] memory result = new Candidate[](count);

        for (uint256 i = 0; i < count; i++)
            result[i] = voteMap[_vIndex].candidateMap[i];

        return result;
    }

    /**
    * Get candidate score list
    * @return (score array of candidates)
    */
    function getCandidateScoreList(uint256 _vIndex) public view isValidVote(_vIndex) returns (uint256[] memory) {
        uint256[] memory scoreList = new uint256[](voteMap[_vIndex].candidateCount);
        for (uint256 i = 0; i < scoreList.length; i++)
            scoreList[i] = voteMap[_vIndex].candidateScore[i];
        return scoreList;
    }
    
    /**
    * Get (voter -> candidate)
    * @return (voter address array, candidate index array)
    */
    function getVoterCandidateMatch(uint256 _vIndex) public view isValidVote(_vIndex) returns(address[] memory, uint256[] memory) {
        uint256[] memory toCandidateList = new uint256[](voteMap[_vIndex].voterList.length);

        for (uint256 i = 0; i < voteMap[_vIndex].voterList.length; i++)
            toCandidateList[i] = voteMap[_vIndex].voterCandidateMap[voteMap[_vIndex].voterList[i]]-1;

        return (voteMap[_vIndex].voterList, toCandidateList);
    }

    /**
    * Set Admin Wallet
    */
    function setAdminWallet(address _adminWallet) public onlyOwner {
        require(_adminWallet != address(0));
        adminWallet = _adminWallet;
    }
}