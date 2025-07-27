// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract BridgeToEndless is ReentrancyGuard, Ownable, Pausable {
    uint256 public nonce;

    // Validator-related
    mapping(address => bool) public validators;
    uint256 public requiredValidators;
    uint256 public validatorCount;

    // Cross-chain transaction records
    struct CrossChainTx {
        address user;
        uint256 amount;
        string endlessAddress;
        uint256 timestamp;
        bool executed;
        uint256 nonce;
        string  executedByTx;
        uint256 chainId;
    }

    mapping(bytes32 => CrossChainTx) public lockTransactions;
    mapping(bytes32 => bool) public processedUnlocks;

    // Events
    event TokensLocked(
        bytes32 indexed txHash,
        address indexed user,
        uint256 amount,
        string endlessAddress,
        uint256 timestamp
    );

    // Events
    event TokensUnlocked(
        bytes32 indexed txHash,
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);
    event ValidatorSigned(address validator, bytes32 txHash);

    // Multisig-related
    mapping(bytes32 => mapping(address => bool)) public validatorSignatures;
    mapping(bytes32 => uint256) public signatureCount;

    constructor(uint256 _requiredValidators) {
        requiredValidators = _requiredValidators;
    }

    modifier onlyValidator() {
        require(validators[msg.sender], "Not a validator");
        _;
    }

    // Add a validator
    function addValidator(address _validator) external onlyOwner {
        require(!validators[_validator], "Already a validator");
        validators[_validator] = true;
        validatorCount++;
        emit ValidatorAdded(_validator);
    }

    // Remove a validator
    function removeValidator(address _validator) external onlyOwner {
        require(validators[_validator], "Not a validator");
        validators[_validator] = false;
        validatorCount--;
        emit ValidatorRemoved(_validator);
    }

    // Set required number of validators
    function setRequiredValidators(uint256 _required) external onlyOwner {
        require(_required <= validatorCount, "Too many required validators");
        requiredValidators = _required;
    }

    // Users lock PIX tokens to Endless
    function lockTokensToEndless(
        string calldata _endlessAddress,
        string calldata _endlessHexAddress
    ) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Amount must be greater than 0");
        // The length of most regular account addresses is between 43 and 44 characters.
        bytes memory strBytes = bytes(_endlessAddress);
        require(strBytes.length >= 43 && strBytes.length <= 44, "Invalid Endless address");

        // Generate transaction hash
        bytes32 txHash = keccak256(abi.encodePacked(
            msg.sender,
            msg.value,
            _endlessHexAddress,
            block.chainid,
            nonce
        ));
        nonce++;

        // Record the lock transaction
        lockTransactions[txHash] = CrossChainTx({
            user: msg.sender,
            amount: msg.value,
            endlessAddress: _endlessAddress,
            timestamp: block.timestamp,
            executed: false,
            nonce: nonce - 1,
            executedByTx: "",
            chainId: block.chainid
        });

        emit TokensLocked(txHash, msg.sender, msg.value, _endlessAddress, block.timestamp);
    }

    // Manually mark a lock transaction as executed (validator only)
    function markAsExecuted(bytes32 _txHash, string calldata _executedByTx) external onlyValidator {
        CrossChainTx storage txRecord = lockTransactions[_txHash];
        require(txRecord.user != address(0), "Transaction not found");
        require(!txRecord.executed, "Already executed");
        txRecord.executed = true;
        txRecord.executedByTx = _executedByTx;
    }

    // Validators sign to unlock tokens (returning from Endless)
    function signUnlockTokens(
        bytes32 _txHash,
        string calldata _endlessSender,
        uint256 _amount,
        address _user,
        uint _chain_id,
        uint256 _nonce
    ) external onlyValidator {
        require(!processedUnlocks[_txHash], "Already processed");
        require(!validatorSignatures[_txHash][msg.sender], "Already signed");

        // Recompute the transaction hash to ensure it matches the expected input
        bytes32 txHash = keccak256(abi.encodePacked(
            _endlessSender,
            _amount,
            _user,
            _chain_id,
            _nonce
        ));
        require(txHash == _txHash, "Invalid txHash");

        validatorSignatures[_txHash][msg.sender] = true;
        signatureCount[_txHash]++;
        emit ValidatorSigned(msg.sender, _txHash);

        // If required signatures are met, execute unlock
        if (signatureCount[_txHash] >= requiredValidators) {
            processedUnlocks[_txHash] = true;

            require(address(this).balance >= _amount, "Insufficient contract balance");
            (bool success,) = _user.call{value: _amount}("");
            require(success, "Transfer failed");

            emit TokensUnlocked(_txHash, _user, _amount, block.timestamp);
        }
    }

    // Emergency pause
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency withdrawal (owner only)
    function emergencyWithdraw(uint256 _amount) external onlyOwner whenPaused {
        require(address(this).balance >= _amount, "Insufficient balance");
        (bool success,) = owner().call{value: _amount}("");
        require(success, "Withdraw failed");
    }

    // View contract balance
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}