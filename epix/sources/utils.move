module pixie::utils {
    use std::vector;
    use std::string::{Self, String};
    use endless_std::endless_hash::keccak256;

    struct Address has copy, drop, store {
        bytes: vector<u8>
    }

    fun create_address(addr_bytes: vector<u8>): Address {
        assert!(vector::length(&addr_bytes) == 20, 1); // Ensure it is 20 bytes
        Address { bytes: addr_bytes }
    }

    // Convert uint256 to 32-byte big-endian representation
    public fun uint256_to_bytes(value: u256): vector<u8> {
        let bytes = vector::empty<u8>();
        let temp = value;

        // Generate 32 bytes (256 bits)
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut bytes, ((temp >> (8 * (31 - i))) & 0xFF as u8));
            i = i + 1;
        };
        bytes
    }

    // Convert string to bytes
    public fun string_to_bytes(str: &String): vector<u8> {
        *string::bytes(str)
    }

    fun solidity_packed_ethers(
        source_address: Address,
        amount: u256,
        target_address: String,
        chain_id: u256,
        nonce: u256
    ): vector<u8> {
        let packed_data = vector::empty<u8>();

        vector::append(&mut packed_data, source_address.bytes);
        // vector::append(&mut packed_data, string_to_bytes(&source_address));
        vector::append(&mut packed_data, uint256_to_bytes(amount));
        vector::append(&mut packed_data, string_to_bytes(&target_address));
        vector::append(&mut packed_data, uint256_to_bytes(chain_id));
        vector::append(&mut packed_data, uint256_to_bytes(nonce));

        packed_data
    }

    fun solidity_packed_move(
        source_address: String,
        amount: u256,
        target_address: Address,
        chain_id: u256,
        nonce: u256
    ): vector<u8> {
        let packed_data = vector::empty<u8>();
        vector::append(&mut packed_data, string_to_bytes(&source_address));
        vector::append(&mut packed_data, uint256_to_bytes(amount));
        // vector::append(&mut packed_data, string_to_bytes(&target_address));
        vector::append(&mut packed_data, target_address.bytes);
        vector::append(&mut packed_data, uint256_to_bytes(chain_id));
        vector::append(&mut packed_data, uint256_to_bytes(nonce));

        packed_data
    }

    // Calculate Keccak256 hash
    fun keccak256_hash(data: vector<u8>): vector<u8> {
        keccak256(data)
    }

    public fun compute_keccak256_move(
        source_address: String,
        amount: u256,
        target_address_str: String,
        chain_id: u256,
        nonce: u256
    ): vector<u8> {
        std::debug::print(&string::utf8(b"compute_keccak256_move"));

        let target_address = address_from_hex(target_address_str);

        std::debug::print(&source_address);
        std::debug::print(&amount);
        std::debug::print(&target_address);
        std::debug::print(&chain_id);
        std::debug::print(&nonce);

        let packed_data = solidity_packed_move(source_address, amount, target_address, chain_id, nonce);
        keccak256_hash(packed_data)
    }

    public fun compute_keccak256_ethers(
        source_address_str: String,
        amount: u256,
        target_address: String,
        chain_id: u256,
        nonce: u256
    ): vector<u8> {
        std::debug::print(&string::utf8(b"compute_keccak256_ethers"));

        let source_address = address_from_hex(source_address_str);
        std::debug::print(&source_address);

        // let target_address_bytes = std::bcs::to_bytes(&target_address);
        // let target_address_str = bytes_to_hex_string(&target_address_bytes);

        std::debug::print(&amount);
        std::debug::print(&target_address);
        std::debug::print(&chain_id);
        std::debug::print(&nonce);

        let packed_data = solidity_packed_ethers(source_address, amount, target_address, chain_id, nonce);
        keccak256_hash(packed_data)
    }

    public fun address_from_move_address(addr: address): Address {
        let addr_bytes = std::bcs::to_bytes(&addr);
        let eth_addr_bytes = vector::empty<u8>();
        let start_index = if (vector::length(&addr_bytes) >= 20) {
            vector::length(&addr_bytes) - 20
        } else {
            0
        };

        let i = start_index;
        while (i < vector::length(&addr_bytes) && vector::length(&eth_addr_bytes) < 20) {
            vector::push_back(&mut eth_addr_bytes, *vector::borrow(&addr_bytes, i));
            i = i + 1;
        };

        while (vector::length(&eth_addr_bytes) < 20) {
            let temp = eth_addr_bytes;
            eth_addr_bytes = vector::empty<u8>();
            vector::push_back(&mut eth_addr_bytes, 0);
            vector::append(&mut eth_addr_bytes, temp);
        };

        create_address(eth_addr_bytes)
    }

    // Create address from hex string
    public fun address_from_hex(hex_str: String): Address {
        let hex_bytes = hex_string_to_bytes(&hex_str);
        create_address(hex_bytes)
    }

    // Convert hex string to byte array
    public fun hex_string_to_bytes(hex_str: &String): vector<u8> {
        let bytes = vector::empty<u8>();
        let hex_chars = string::bytes(hex_str);
        let len = vector::length(hex_chars);

        // Remove optional 0x prefix
        let start = if (len >= 2 && *vector::borrow(hex_chars, 0) == 48 && *vector::borrow(hex_chars, 1) == 120) { 2 } else { 0 };

        let i = start;
        while (i < len) {
            if (i + 1 < len) {
                let high = hex_char_to_u8(*vector::borrow(hex_chars, i));
                let low = hex_char_to_u8(*vector::borrow(hex_chars, i + 1));
                vector::push_back(&mut bytes, (high << 4) | low);
                i = i + 2;
            } else {
                i = i + 1;
            };
        };

        bytes
    }

    fun u8_to_hex_char(value: u8): u8 {
        if (value < 10) {
            48 + value // '0'-'9'
        } else {
            97 + value - 10 // 'a'-'f'
        }
    }

    public fun bytes_to_hex_string(bytes: &vector<u8>): String {
        let hex_chars = vector::empty<u8>();
        vector::append(&mut hex_chars, b"0x");

        let i = 0;
        while (i < vector::length(bytes)) {
            let byte = *vector::borrow(bytes, i);
            let high = byte / 16;
            let low = byte % 16;

            vector::push_back(&mut hex_chars, u8_to_hex_char(high));
            vector::push_back(&mut hex_chars, u8_to_hex_char(low));
            i = i + 1;
        };

        string::utf8(hex_chars)
    }

    // Convert hex character to number
    public fun hex_char_to_u8(char: u8): u8 {
        if (char >= 48 && char <= 57) { // '0'-'9'
            char - 48
        } else if (char >= 65 && char <= 70) { // 'A'-'F'
            char - 65 + 10
        } else if (char >= 97 && char <= 102) { // 'a'-'f'
            char - 97 + 10
        } else {
            abort 2 // Invalid hex character
        }
    }

    #[test]
    fun test_compute_ethers() {
        let user_addr = string::utf8(b"0x7A3C506E4BccEC58Dc903BFa106a3bA371d274E0");
        // let user_addr = @0x7A3C506E4BccEC58Dc903BFa106a3bA371d274E0;
        let amount = 320000u256;
        let target_addr = @0x04d87b79caea9a3d826e4b15702e6a1df9b1573b0e2d5b6a7804f678c1b290bd;
        let chain_id = 6626u256;
        let nonce = 1u256;

        let hash_result = compute_keccak256_ethers(
            user_addr,
            amount,
            target_addr,
            chain_id,
            nonce
        );

        std::debug::print(&hash_result);

        let result = bytes_to_hex_string(&hash_result);
        let expected_hex = string::utf8(b"0xf7bb12eec6f62ea49401914e1cbde0868b60bb41332a6b59b7cc94d64fd637e5");

        assert!(result == expected_hex, 3);
    }

    #[test]
    fun test_compute_move() {
        let user_addr = @0xd009c226d624fb538c531db696fe0837c7b911612a03b5d07b78da2b14ada65c;
        let amount = 320000u256;
        let target_addr = string::utf8(b"0x7A3C506E4BccEC58Dc903BFa106a3bA371d274E0");
        let chain_id = 223u256;
        let nonce = 2u256;

        let hash_result = compute_keccak256_move(
            user_addr,
            amount,
            target_addr,
            chain_id,
            nonce
        );

        std::debug::print(&hash_result);

        let result = bytes_to_hex_string(&hash_result);
        let expected_hex = string::utf8(b"0xfce56464c5aeb67dc9f20fc15f95ab044c4b55884ac0941574c561ffc08b7f06");

        assert!(result == expected_hex, 3);
    }
}
