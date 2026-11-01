import argparse
from pathlib import Path


def packed_text(text):
    characters = [ord(c) - ord("a") + 6 for c in text]
    characters += [5] * ((-len(characters)) % 3)
    words = [
        (characters[i] << 10) | (characters[i + 1] << 5) | characters[i + 2]
        for i in range(0, len(characters), 3)
    ]
    words[-1] |= 0x8000
    return b"".join(word.to_bytes(2, "big") for word in words)


def story(version):
    data = bytearray(0x600)

    def word(address, value):
        data[address:address + 2] = value.to_bytes(2, "big")

    data[0] = version
    word(2, 1)
    word(4, 0x500)
    word(6, 0x500)
    word(8, 0x480)
    word(10, 0x80)
    word(12, 0x200)
    word(14, 0x500)
    data[18:24] = b"TEST01"
    word(26, len(data) // (2 if version <= 3 else 4))
    defaults, entry_size, property_offset = (62, 9, 7) if version <= 3 else (126, 14, 12)
    for index, name in enumerate(("foyer", "garden")):
        address = 0x180 + index * 16
        text = packed_text(name)
        data[address] = len(text) // 2
        data[address + 1:address + 1 + len(text)] = text
        word(0x80 + defaults + index * entry_size + property_offset, address)
    word(0x200, 1)
    word(0x202, 7)
    word(0x204, 2)
    data[0x400] = 40
    data[0x480:0x484] = bytes((0, 4 if version <= 3 else 6, 0, 0))
    data[0x500:0x502] = bytes((0xBC, 0xBA))  # show_status, quit
    data[0x580] = data[0x582] = 0xC2 if version <= 3 else 17
    word(28, sum(data[64:]) & 0xFFFF)
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate original, minimal Z-machine test stories.")
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for version in (1, 2, 3, 5):
        (args.directory / f"fixture.z{version}").write_bytes(story(version))
