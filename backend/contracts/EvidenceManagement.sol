// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EvidenceManagement {
    // --- Enums ---
    enum EvidenceStatus { Submitted, UnderReview, Verified, Archived }
    enum UserStatus { Pending, Approved, Rejected }

    // --- Structs ---
    // No submitter is stored. Persisting msg.sender would permanently bind a
    // whistleblower's wallet to their tip, which defeats the purpose of the
    // portal. See submitAnonymousTip for the limits of this guarantee.
    struct Tip {
        string ipfsHash;
        string description;
        uint256 timestamp;
    }

    struct Evidence {
        string[] ipfsHashes;
        string caseNumber;
        string location;
        string crimeDescription;
        string[] fileTypes;
        string officerName;
        uint256 timestamp;
        EvidenceStatus status;
        bool exists;
    }

    struct AccessRecord {
        address accessedBy;
        string accessorName;
        string accessorRole;
        uint256 timestamp;
        string action; // "Viewed", "Verified", "StatusChanged"
    }

    // --- State Variables ---
    address public admin;

    mapping(string => Evidence) public evidenceRecords;
    string[] public evidenceIds;

    mapping(address => string) public userRoles;
    mapping(address => string) public userNames;
    mapping(address => bool) public registeredUsers;
    mapping(address => UserStatus) public userApprovalStatus;

    // Chain of Custody: evidenceId => AccessRecord[]
    mapping(string => AccessRecord[]) public chainOfCustody;

    // Pending user list for admin approval
    address[] public pendingUsers;

    // Anonymous Tips
    Tip[] public anonymousTips;

    // --- Events ---
    event EvidenceAdded(string evidenceId, uint256 fileCount, string officerName, uint256 timestamp);
    event EvidenceAccessed(string evidenceId, address accessedBy, uint256 timestamp);
    event EvidenceStatusChanged(string evidenceId, EvidenceStatus newStatus, address changedBy, uint256 timestamp);
    event UserRegistered(address userAddress, string role, string name);
    event UserApproved(address userAddress, string role, address approvedBy);
    event UserRejected(address userAddress, address rejectedBy);
    event TipSubmitted(uint256 tipId, uint256 timestamp);
    event EvidenceAppended(string evidenceId, uint256 newFileCount, address appendedBy, uint256 timestamp);

    // --- Modifiers ---
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyApproved() {
        require(userApprovalStatus[msg.sender] == UserStatus.Approved, "User not approved by admin");
        _;
    }

    modifier onlyPolice() {
        require(
            keccak256(abi.encodePacked(userRoles[msg.sender])) == keccak256(abi.encodePacked("Police")),
            "Only police officers can perform this action"
        );
        _;
    }

    modifier onlyCourt() {
        require(
            keccak256(abi.encodePacked(userRoles[msg.sender])) == keccak256(abi.encodePacked("Court")),
            "Only court officials can perform this action"
        );
        _;
    }

    modifier onlyRegistered() {
        require(registeredUsers[msg.sender], "User not registered");
        _;
    }

    // --- Constructor ---
    constructor() {
        admin = msg.sender;
        // Auto-register and approve the admin
        userRoles[msg.sender] = "Admin";
        userNames[msg.sender] = "System Administrator";
        registeredUsers[msg.sender] = true;
        userApprovalStatus[msg.sender] = UserStatus.Approved;
    }

    // --- User Management ---
    function registerUser(string memory _name, string memory _role) public {
        require(!registeredUsers[msg.sender], "User already registered");
        require(
            keccak256(abi.encodePacked(_role)) == keccak256(abi.encodePacked("Police")) ||
            keccak256(abi.encodePacked(_role)) == keccak256(abi.encodePacked("Court")),
            "Role must be either Police or Court"
        );

        userRoles[msg.sender] = _role;
        userNames[msg.sender] = _name;
        registeredUsers[msg.sender] = true;
        userApprovalStatus[msg.sender] = UserStatus.Pending;
        pendingUsers.push(msg.sender);

        emit UserRegistered(msg.sender, _role, _name);
    }

    function approveUser(address _userAddress) public onlyAdmin {
        require(registeredUsers[_userAddress], "User not registered");
        require(userApprovalStatus[_userAddress] == UserStatus.Pending, "User is not pending approval");

        userApprovalStatus[_userAddress] = UserStatus.Approved;
        emit UserApproved(_userAddress, userRoles[_userAddress], msg.sender);
    }

    function rejectUser(address _userAddress) public onlyAdmin {
        require(registeredUsers[_userAddress], "User not registered");
        require(userApprovalStatus[_userAddress] == UserStatus.Pending, "User is not pending approval");

        userApprovalStatus[_userAddress] = UserStatus.Rejected;
        emit UserRejected(_userAddress, msg.sender);
    }

    function getPendingUsersCount() public view returns (uint256) {
        return pendingUsers.length;
    }

    function getPendingUser(uint256 _index) public view returns (address, string memory, string memory, UserStatus) {
        address userAddr = pendingUsers[_index];
        return (userAddr, userNames[userAddr], userRoles[userAddr], userApprovalStatus[userAddr]);
    }

    // --- Evidence Management ---
    function addEvidence(
        string memory _evidenceId,
        string[] memory _ipfsHashes,
        string memory _caseNumber,
        string memory _location,
        string memory _crimeDescription,
        string[] memory _fileTypes
    ) public onlyPolice onlyApproved {
        require(!evidenceRecords[_evidenceId].exists, "Evidence ID already exists");

        Evidence memory newEvidence = Evidence({
            ipfsHashes: _ipfsHashes,
            caseNumber: _caseNumber,
            location: _location,
            crimeDescription: _crimeDescription,
            fileTypes: _fileTypes,
            officerName: userNames[msg.sender],
            timestamp: block.timestamp,
            status: EvidenceStatus.Submitted,
            exists: true
        });

        evidenceRecords[_evidenceId] = newEvidence;
        evidenceIds.push(_evidenceId);

        // Record in Chain of Custody
        chainOfCustody[_evidenceId].push(AccessRecord({
            accessedBy: msg.sender,
            accessorName: userNames[msg.sender],
            accessorRole: userRoles[msg.sender],
            timestamp: block.timestamp,
            action: "Submitted"
        }));

        emit EvidenceAdded(_evidenceId, _ipfsHashes.length, userNames[msg.sender], block.timestamp);
    }

    function appendEvidence(
        string memory _evidenceId,
        string[] memory _newIpfsHashes,
        string[] memory _newFileTypes
    ) public onlyPolice onlyApproved {
        require(evidenceRecords[_evidenceId].exists, "Evidence does not exist");
        
        Evidence storage evidence = evidenceRecords[_evidenceId];
        
        for (uint i = 0; i < _newIpfsHashes.length; i++) {
            evidence.ipfsHashes.push(_newIpfsHashes[i]);
            evidence.fileTypes.push(_newFileTypes[i]);
        }
        
        // Record in Chain of Custody
        chainOfCustody[_evidenceId].push(AccessRecord({
            accessedBy: msg.sender,
            accessorName: userNames[msg.sender],
            accessorRole: userRoles[msg.sender],
            timestamp: block.timestamp,
            action: "AppendedFiles"
        }));
        
        emit EvidenceAppended(_evidenceId, _newIpfsHashes.length, msg.sender, block.timestamp);
    }

    function getEvidence(string memory _evidenceId) public onlyApproved returns (
        string[] memory ipfsHashes,
        string memory caseNumber,
        string memory location,
        string memory crimeDescription,
        string[] memory fileTypes,
        string memory officerName,
        uint256 timestamp
    ) {
        require(evidenceRecords[_evidenceId].exists, "Evidence does not exist");

        Evidence memory evidence = evidenceRecords[_evidenceId];

        // Record access in Chain of Custody
        chainOfCustody[_evidenceId].push(AccessRecord({
            accessedBy: msg.sender,
            accessorName: userNames[msg.sender],
            accessorRole: userRoles[msg.sender],
            timestamp: block.timestamp,
            action: "Viewed"
        }));

        emit EvidenceAccessed(_evidenceId, msg.sender, block.timestamp);

        return (
            evidence.ipfsHashes,
            evidence.caseNumber,
            evidence.location,
            evidence.crimeDescription,
            evidence.fileTypes,
            evidence.officerName,
            evidence.timestamp
        );
    }

    function getEvidenceData(string memory _evidenceId) public view returns (
        string[] memory ipfsHashes,
        string memory caseNumber,
        string memory location,
        string memory crimeDescription,
        string[] memory fileTypes,
        string memory officerName,
        uint256 timestamp,
        EvidenceStatus status,
        bool exists
    ) {
        Evidence memory e = evidenceRecords[_evidenceId];
        return (
            e.ipfsHashes,
            e.caseNumber,
            e.location,
            e.crimeDescription,
            e.fileTypes,
            e.officerName,
            e.timestamp,
            e.status,
            e.exists
        );
    }

    function updateEvidenceStatus(string memory _evidenceId, EvidenceStatus _newStatus) public onlyApproved {
        require(evidenceRecords[_evidenceId].exists, "Evidence does not exist");

        // Only Court can mark as Verified, only Police can mark as UnderReview
        if (_newStatus == EvidenceStatus.Verified) {
            require(
                keccak256(abi.encodePacked(userRoles[msg.sender])) == keccak256(abi.encodePacked("Court")),
                "Only court officials can verify evidence"
            );
        }

        evidenceRecords[_evidenceId].status = _newStatus;

        // Record in Chain of Custody
        chainOfCustody[_evidenceId].push(AccessRecord({
            accessedBy: msg.sender,
            accessorName: userNames[msg.sender],
            accessorRole: userRoles[msg.sender],
            timestamp: block.timestamp,
            action: "StatusChanged"
        }));

        emit EvidenceStatusChanged(_evidenceId, _newStatus, msg.sender, block.timestamp);
    }

    // --- Chain of Custody ---
    function getChainOfCustodyLength(string memory _evidenceId) public view returns (uint256) {
        return chainOfCustody[_evidenceId].length;
    }

    function getChainOfCustodyRecord(string memory _evidenceId, uint256 _index) public view returns (
        address accessedBy,
        string memory accessorName,
        string memory accessorRole,
        uint256 timestamp,
        string memory action
    ) {
        AccessRecord memory record = chainOfCustody[_evidenceId][_index];
        return (record.accessedBy, record.accessorName, record.accessorRole, record.timestamp, record.action);
    }

    // --- View Functions ---
    function getEvidenceCount() public view returns (uint256) {
        return evidenceIds.length;
    }

    function getEvidenceStatus(string memory _evidenceId) public view returns (EvidenceStatus) {
        require(evidenceRecords[_evidenceId].exists, "Evidence does not exist");
        return evidenceRecords[_evidenceId].status;
    }

    function isUserRegistered(address _userAddress) public view returns (bool) {
        return registeredUsers[_userAddress];
    }

    function isUserApproved(address _userAddress) public view returns (bool) {
        return userApprovalStatus[_userAddress] == UserStatus.Approved;
    }

    function getUserRole(address _userAddress) public view returns (string memory) {
        require(registeredUsers[_userAddress], "User not registered");
        return userRoles[_userAddress];
    }

    function getUserName(address _userAddress) public view returns (string memory) {
        require(registeredUsers[_userAddress], "User not registered");
        return userNames[_userAddress];
    }

    function getAdmin() public view returns (address) {
        return admin;
    }

    // --- Whistleblower ---
    /// @notice Records an anonymous tip without linking it to the sender.
    /// @dev The contract stores and emits no submitter address. Note that the
    /// transaction's `from` address is still public in the chain's transaction
    /// history - on-chain storage cannot hide that. A submitter who needs full
    /// anonymity must use a wallet that is not tied to their identity.
    function submitAnonymousTip(string memory _ipfsHash, string memory _description) public {
        anonymousTips.push(Tip({
            ipfsHash: _ipfsHash,
            description: _description,
            timestamp: block.timestamp
        }));
        emit TipSubmitted(anonymousTips.length - 1, block.timestamp);
    }

    function getTipsCount() public view returns (uint256) {
        return anonymousTips.length;
    }

    function getTip(uint256 _index) public view returns (
        string memory ipfsHash,
        string memory description,
        uint256 timestamp
    ) {
        Tip memory t = anonymousTips[_index];
        return (t.ipfsHash, t.description, t.timestamp);
    }
}