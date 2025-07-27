import { Buffer } from 'buffer';
import bs58 from 'bs58';

const convert = (endlessAddress) => {
    const endlessAddressBytes = bs58.decode(endlessAddress);
    const endlessAddressHex = Buffer.from(endlessAddressBytes).toString('hex');
    return `0x${endlessAddressHex}`;
}

export { convert }