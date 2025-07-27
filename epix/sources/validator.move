module pixie::validator {
    use std::signer;
    use endless_framework::event;
    use std::vector;
    use endless_framework::account::{create_resource_account, SignerCapability};

    friend pixie::token;

    const E_NOT_ADMIN: u64 = 1;
    const E_NOT_VALIDATOR: u64 = 2;
    const E_ALREADY_PROCESSED: u64 = 4;

    const ASSET_SYMBOL: vector<u8> = b"ePIX_VALIDATOR";

    struct Validator has key {
        signer_cap: SignerCapability,
        admin_address: address,
        validator_list: vector<address>,
        min_required_signatures: u64,
    }

    #[event]
    struct ValidatorAddedEvent has drop, store {
        validator: address,
    }

    #[event]
    struct ValidatorRemovedEvent has drop, store {
        validator: address,
    }

    // Initialize Token and Bridge
    fun init_module(admin: &signer) {
        let (_resource_signer, signer_cap) = create_resource_account(admin, ASSET_SYMBOL);
        let admin_addr = signer::address_of(admin);

        // Initialize Bridge Configuration
        move_to(admin, Validator {
            signer_cap: signer_cap,
            admin_address: admin_addr,
            validator_list: vector::empty<address>(),
            // Initially set to 1, can be modified later via set_required_validators
            min_required_signatures: 1,
        });
    }

    inline fun verify_admin(admin: &signer, validator: &Validator) {
        assert!(
            validator.admin_address == signer::address_of(admin)
                || signer::address_of(admin) == @pixie,
            E_NOT_ADMIN
        );
    }

    inline fun authorized_borrow_refs(): &mut Validator acquires Validator {
        borrow_global_mut<Validator>(@pixie)
    }

    public entry fun transfer_ownership(admin: &signer, new_admin: address) acquires Validator {
        let validator = authorized_borrow_refs();
        verify_admin(admin, validator);
        validator.admin_address = new_admin;
    }

    // Add Validator
    public entry fun add_validator(admin: &signer, new_validator: address) acquires Validator {
        let validator = authorized_borrow_refs();
        verify_admin(admin, validator);

        assert!(!vector::contains(&validator.validator_list, &new_validator), E_ALREADY_PROCESSED);

        vector::push_back(&mut validator.validator_list, new_validator);
        event::emit(ValidatorAddedEvent { validator: new_validator })
    }

    // Remove Validator
    public entry fun remove_validator(admin: &signer, old_validator: address) acquires Validator {
        let validator = authorized_borrow_refs();
        verify_admin(admin, validator);

        if (vector::contains(&validator.validator_list, &old_validator)) {
            vector::remove_value(&mut validator.validator_list, &old_validator);
        };

        event::emit(ValidatorRemovedEvent { validator: old_validator })
    }

    // Set Required Validator Count
    public entry fun set_min_required_signatures(admin: &signer, required: u64) acquires Validator {
        let admin_addr = signer::address_of(admin);
        let validator = authorized_borrow_refs();
        assert!(validator.admin_address == admin_addr, E_NOT_ADMIN);

        validator.min_required_signatures = required;
    }

    public(friend) fun role_check(user: &signer) acquires Validator {
        let validator = authorized_borrow_refs();
        let user_addr = signer::address_of(user);

        assert!(vector::contains(&validator.validator_list, &user_addr), E_NOT_VALIDATOR);
    }

    #[view]
    public fun get_min_required_signatures(): u64 acquires Validator {
        let validator = authorized_borrow_refs();
        validator.min_required_signatures
    }

    #[view]
    public fun get_validators(): vector<address> acquires Validator {
        let node = authorized_borrow_refs();
        node.validator_list
    }

    #[view]
    public fun get_admin(): address acquires Validator {
        let admin = authorized_borrow_refs().admin_address;
        admin
    }
}
