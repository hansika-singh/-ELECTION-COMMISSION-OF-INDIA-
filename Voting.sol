// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    mapping(uint => Candidate) public candidates;
    mapping(address => bool) public hasVoted;

    uint public candidateCount;
    bool public electionActive;

    function addCandidate(string memory name) public {
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, name, 0);
    }

    function startElection() public {
        electionActive = true;
    }

    function endElection() public {
        electionActive = false;
    }

    function vote(uint candidateId) public {
        require(electionActive, "Election not active");
        require(!hasVoted[msg.sender], "Already voted");

        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount++;
    }

    function getVotes(uint id) public view returns(uint) {
        return candidates[id].voteCount;
    }
}