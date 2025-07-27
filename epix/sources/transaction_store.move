module pixie::transaction_store {
    use std::signer;
    use std::string;
    use std::string::String;
    use endless_framework::event;
    use endless_framework::object;
    use endless_framework::timestamp;
    use endless_std::simple_map;
    use endless_std::simple_map::SimpleMap;
    use endless_std::table;
    use endless_std::table::Table;

    friend pixie::token;

    const E_ALREADY_PROCESSED: u64 = 4;
    const E_ALREADY_SIGNED: u64 = 6;
    const ASSET_SYMBOL: vector<u8> = b"ePIX_TRANSACTION";

    // Cross-Chain Transaction Record
    struct CrossChainTx has store, copy {
        user: address,
        amount: u256,
        pixie_address: String,
        timestamp: u64,
        executed: bool,
        nonce: u256,
        executed_by_tx: String,
        chain_id: u256
    }

    #[event]
    struct TokensLockedEvent has drop, store {
        tx_hash: String,
        user: address,
        amount: u256,
        pixie_address: String,
        timestamp: u64,
    }

    // Transaction Storage
    struct TransactionStore has key {
        // Lock Transactions (Endless -> PixieChain)
        lock_transactions: Table<String, CrossChainTx>,
        // Processed Mint Transactions (PixieChain -> Endless)
        processed_mints: Table<String, bool>,
        // Multi-signature Records
        validator_signatures: Table<String, SimpleMap<address, bool>>,
        signature_counts: Table<String, u64>
    }

    // Initialize Token and Bridge
    fun init_module(admin: &signer) {
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        let metadata_object_signer = object::generate_signer(constructor_ref);

        // Initialize Transaction Storage
        move_to(&metadata_object_signer, TransactionStore {
            lock_transactions: table::new(),
            processed_mints: table::new(),
            validator_signatures: table::new(),
            signature_counts: table::new()
        });
    }

    inline fun authorized_borrow_refs(): &mut TransactionStore acquires TransactionStore {
        let asset = get_metadata();
        borrow_global_mut<TransactionStore>(asset)
    }

    public(friend) fun set_lock_transaction_executed(tx_hash: String, executed_by_tx: String) acquires TransactionStore {
        let tx_store = authorized_borrow_refs();
        let tx = table::borrow_mut(&mut tx_store.lock_transactions, tx_hash);
        tx.executed = true;
        tx.executed_by_tx = executed_by_tx;
    }

    public(friend) fun save_lock_transaction(user: &signer, tx_hash: String, amount: u256, target_address: String, nonce: u256, chain_id: u256) acquires TransactionStore {
        let user_addr = signer::address_of(user);
        let tx_store = authorized_borrow_refs();

        // Record Lock Transaction
        table::add(&mut tx_store.lock_transactions, tx_hash, CrossChainTx {
            user: user_addr,
            amount: amount,
            pixie_address: target_address,
            timestamp: timestamp::now_seconds(),
            executed: false,
            nonce: nonce,
            executed_by_tx: string::utf8(b""),
            chain_id: chain_id
        });

        event::emit(TokensLockedEvent {
            tx_hash: tx_hash,
            user: user_addr,
            amount: amount,
            pixie_address: target_address,
            timestamp: timestamp::now_seconds(),
        });
    }

    public(friend) fun save_signature(validator: &signer, tx_hash: String): u64 acquires TransactionStore {
        let tx_store = authorized_borrow_refs();

        // Check if Already Processed
        assert!(!table::contains(&tx_store.processed_mints, tx_hash), E_ALREADY_PROCESSED);

        // Initialize Signature Records (if not exist)
        if (!table::contains(&tx_store.validator_signatures, tx_hash)) {
            table::add(&mut tx_store.validator_signatures, tx_hash, simple_map::create<address, bool>());
            table::add(&mut tx_store.signature_counts, tx_hash, 0);
        };

        let signatures = table::borrow_mut(&mut tx_store.validator_signatures, tx_hash);
        let signature_count = table::borrow_mut(&mut tx_store.signature_counts, tx_hash);

        let validator_addr = signer::address_of(validator);

        // Check if Already Signed
        assert!(!simple_map::contains_key(signatures, &validator_addr), E_ALREADY_SIGNED);

        // Add Signature
        simple_map::add(signatures, validator_addr, true);
        *signature_count = *signature_count + 1;

        *signature_count
    }

    public(friend) fun save_processed_mint(tx_hash: String) acquires TransactionStore {
        let tx_store = authorized_borrow_refs();
        table::add(&mut tx_store.processed_mints, tx_hash, true);
    }

    #[view]
    public fun get_metadata(): address {
        object::create_object_address(&@pixie, ASSET_SYMBOL)
    }

    #[view]
    public fun is_cross_chain_tx_processed(tx_hash: String): bool acquires TransactionStore {
        let tx_store = authorized_borrow_refs();
        table::contains(&tx_store.processed_mints, tx_hash)
    }

    #[view]
    public fun get_locked_transaction(tx_hash: String): CrossChainTx acquires TransactionStore {
        let tx_store = authorized_borrow_refs();
        let tx = table::borrow(&mut tx_store.lock_transactions, tx_hash);
        *tx
    }
}
