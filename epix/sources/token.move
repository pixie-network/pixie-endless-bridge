module pixie::token {
    use std::bcs;
    use std::signer;
    use std::string::{Self, String};
    use std::option;
    use std::string::utf8;
    use endless_framework::chain_id::get;
    use endless_framework::object::{Self, Object};
    use endless_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata};
    use endless_framework::event::{Self};
    use endless_framework::timestamp;
    use endless_framework::primary_fungible_store;
    use pixie::transaction_store;
    use pixie::utils;
    use pixie::validator;

    const E_NOT_ADMIN: u64 = 1;
    const E_NOT_VALIDATOR: u64 = 2;
    const E_INVALID_AMOUNT: u64 = 3;

    const E_INSUFFICIENT_SIGNATURES: u64 = 5;

    const E_INVALID_ADDRESS: u64 = 7;
    const E_BRIDGE_PAUSED: u64 = 8;
    const E_INVALID_TXHASH: u64 = 9;

    const ASSET_SYMBOL: vector<u8> = b"ePIX";
    const VALIDATOR_SYMBOL: vector<u8> = b"ePIX_VALIDATOR";

    // EPIX Configuration
    struct EPIX has key {
        admin: address,
        paused: bool,
        nonce: u256,
        // Capabilities
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    #[event]
    struct TokensMintedEvent has drop, store {
        tx_hash: String,
        user: address,
        amount: u256,
        timestamp: u64,
    }

    #[event]
    struct TokensLockedEvent has drop, store {
        tx_hash: String,
        user_address: String,
        amount: u256,
        target_address: String,
        chain_id: u256,
        nonce: u256,
    }

    // Initialize Token and Bridge
    fun init_module(admin: &signer) {
        // Create the main token resource account
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(),
            utf8(b"PIXIE"),
            utf8(ASSET_SYMBOL),
            9,
            string::utf8(b"https://images.pixie.xyz/logos/pix.png"),
            utf8(b"https://pixie.xyz/"),
        );

        // Create mint/burn/transfer refs to allow creator to manage the fungible asset.
        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let metadata_object_signer = object::generate_signer(constructor_ref);
        let admin_addr = signer::address_of(admin);

        // Initialize Bridge Configuration
        move_to(&metadata_object_signer, EPIX {
            admin: admin_addr,
            paused: false,
            nonce: 1,
            mint_ref,
            burn_ref,
            transfer_ref,
        });
    }

    inline fun verify_admin(admin: &signer, pixie: &EPIX) {
        assert!(
            pixie.admin == signer::address_of(admin)
                || signer::address_of(admin) == @pixie,
            0
        );
    }

    public entry fun transfer_ownership(admin: &signer, new_admin: address) acquires EPIX {
        let pixie = authorized_borrow_refs();
        verify_admin(admin, pixie);

        pixie.admin = new_admin;
    }

    /// Borrow the immutable reference of the refs of `metadata`.
    /// This validates that the signer is the metadata object's owner.
    inline fun authorized_borrow_refs(): &mut EPIX acquires EPIX {
        let asset = get_metadata();
        borrow_global_mut<EPIX>(object::object_address(&asset))
    }

    // User Locks ePIX Tokens to PixieChain
    public entry fun lock_tokens_to_pixie(
        user: &signer,
        amount: u256,
        target_address: String
    ) acquires EPIX {
        let user_addr = signer::address_of(user);

        let pixie = authorized_borrow_refs();

        assert!(!pixie.paused, E_BRIDGE_PAUSED);
        assert!(amount > 0, E_INVALID_AMOUNT);

        let normalized_amount = conevert_from_wei(amount);

        // Burn User's ePIX Tokens
        let asset = get_metadata();
        let from_wallet = primary_fungible_store::ensure_primary_store_exists(user_addr, asset);
        fungible_asset::burn_from(&pixie.burn_ref, from_wallet, (normalized_amount as u128));

        // Convert Base58 address to Hex
        let addr_bytes = bcs::to_bytes(&user_addr);
        let user_addr_hex = utils::bytes_to_hex_string(&addr_bytes);

        let chain_id = get_chain_id();

        let hash_result_bytes = utils::compute_keccak256_move(user_addr_hex, amount, target_address, chain_id, pixie.nonce);
        let hash_result_hex = utils::bytes_to_hex_string(&hash_result_bytes);

        event::emit(TokensLockedEvent {
            tx_hash: hash_result_hex,
            user_address: user_addr_hex,
            amount,
            target_address,
            chain_id: chain_id,
            nonce: pixie.nonce,
        });

        transaction_store::save_lock_transaction(user, hash_result_hex, amount, target_address, pixie.nonce, chain_id);

        pixie.nonce = pixie.nonce + 1;
    }

    public entry fun set_lock_transaction_executed(validator: &signer, tx_hash: String, executed_by_tx: String) {
        validator::role_check(validator);
        transaction_store::set_lock_transaction_executed(tx_hash, executed_by_tx);
    }

    inline fun conevert_from_wei(amount: u256): u256 {
        amount / 1_000_000_000 // from wei to 9-decimals
    }

    // Validator Signs to Mint Tokens (Returning from PixieChain)
    public entry fun sign_mint_tokens(
        validator: &signer,
        tx_hash: String,
        source_user_address: String,
        amount: u256,
        target_user_address: address,
        chain_id: u256,
        nonce: u256
    ) acquires EPIX {
        validator::role_check(validator);

        std::debug::print(&string::utf8(b"sign_mint_tokens"));

        std::debug::print(&target_user_address);

        let target_addr_bytes = bcs::to_bytes(&target_user_address);
        let target_user_addr_hex = utils::bytes_to_hex_string(&target_addr_bytes);

        // Check if tx_hash is valid
        let hash_result_bytes = utils::compute_keccak256_ethers(source_user_address, amount, target_user_addr_hex, chain_id, nonce);
        let expected_hex = utils::bytes_to_hex_string(&hash_result_bytes);

        std::debug::print(&expected_hex);

        assert!(tx_hash == expected_hex, E_INVALID_TXHASH);

        let pixie = authorized_borrow_refs();

        assert!(pixie.paused == false, E_BRIDGE_PAUSED);

        let signature_count = transaction_store::save_signature(validator, tx_hash);

        // Execute Minting if Signature Count Meets Requirements
        if (signature_count >= validator::get_min_required_signatures()) {
            transaction_store::save_processed_mint(tx_hash);

            let normalized_amount = conevert_from_wei(amount);

            // Mint Tokens to User
            let asset = get_metadata();
            let user_store = primary_fungible_store::ensure_primary_store_exists(target_user_address, asset);
            fungible_asset::mint_to(&pixie.mint_ref, user_store, (normalized_amount as u128));

            // Emit Event
            event::emit(TokensMintedEvent {
                tx_hash,
                user: target_user_address,
                amount,
                timestamp: timestamp::now_seconds(),
            });
        }
    }

    // Pause/Resume Bridge
    public entry fun set_paused(admin: &signer, paused: bool) acquires EPIX {
        let admin_addr = signer::address_of(admin);
        let pixie = authorized_borrow_refs();
        assert!(pixie.admin == admin_addr, E_NOT_ADMIN);
        pixie.paused = paused;
    }

    #[view]
    public fun get_nonce(): u256 acquires EPIX {
        let pixie = authorized_borrow_refs();
        pixie.nonce
    }

    #[view]
    public fun get_balance(user: address): u128 {
        let asset = get_metadata();
        primary_fungible_store::balance(user, asset)
    }

    #[view]
    /// Return the address of the managed fungible asset that's created when this module is deployed.
    public fun get_metadata(): Object<Metadata> {
        let asset_address = object::create_object_address(&@pixie, ASSET_SYMBOL);
        object::address_to_object<Metadata>(asset_address)
    }

    #[view]
    public fun is_paused(): bool acquires EPIX {
        let pixie = authorized_borrow_refs();
        pixie.paused
    }

    #[view]
    public fun get_chain_id(): u256 {
        let chain_id = get();
        ((chain_id as u64) as u256)
    }

    #[test(user = @pixie)]
    public fun test_compute_hash(user: &signer) {
        let user_addr = signer::address_of(user);
        let amount = 320000u256;
        let nonce = 1u256;
        let target_address = string::utf8(b"0x7A3C506E4BccEC58Dc903BFa106a3bA371d274E0");
        let chain_id = 223u8; // get();
        let hash_result_bytes = utils::compute_keccak256_move(user_addr, amount, target_address, ((chain_id as u64) as u256), nonce);
        let hash = utils::bytes_to_hex_string(&hash_result_bytes);

        let expected_hex = string::utf8(b"0xf7bb12eec6f62ea49401914e1cbde0868b60bb41332a6b59b7cc94d64fd637e5");

        std::debug::print(&user_addr);
        std::debug::print(&amount);
        std::debug::print(&target_address);
        std::debug::print(&chain_id);
        std::debug::print(&nonce);
        std::debug::print(&hash);

        assert!(hash == expected_hex, 3);
    }
}