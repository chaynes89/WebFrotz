"""Original interactive V1-V5 fixtures executing real Z-machine opcodes.

No commercial story material or external story compiler is used.
"""
import argparse
from pathlib import Path
from make_story import story


def text(value):
    characters = [0 if c == " " else ord(c) - ord("a") + 6 for c in value]
    characters += [5] * ((-len(characters)) % 3)
    words = [(characters[i] << 10) | (characters[i + 1] << 5) | characters[i + 2]
             for i in range(0, len(characters), 3)]
    words[-1] |= 0x8000
    return b"".join(word.to_bytes(2, "big") for word in words)


def interactive(version, timed=False, showcase=False):
    if showcase and version != 3:
        raise ValueError("The original showcase fixture uses V3 room telemetry.")
    data = story(version) + bytearray(0xA00)
    code = bytearray()
    labels = {}
    patches = []

    def emit(*values):
        code.extend(values)

    def label(name):
        labels[name] = len(code)

    def say(value):
        emit(0xB2)  # print
        code.extend(text(value))
        emit(0xBB)  # new_line

    def jump(destination):
        emit(0x8C)  # jump, large constant
        patches.append((len(code), destination, False))
        emit(0, 0)

    def branch(destination):
        patches.append((len(code), destination, True))
        emit(0, 0)

    def equals(variable, value, destination):
        emit(0xC1, 0x9F, variable, ord(value) if isinstance(value, str) else value)
        branch(destination)

    def location(value):
        emit(0xCD, 0x5F, 16, value)  # store global0

    say("webfrotz survey station" if showcase else "webfrotz survey fixture")
    say("explore north east south west up and down" if showcase else "type north south save restore look or quit")
    if timed:
        emit(0xF6, 0x57, 1, 1, 22)  # read_char with timeout; browser host must report unsupported
    if version in (3, 5):
        emit(0xEA, 0x7F, 2)  # split_window 2
        emit(0xEB, 0x7F, 1)  # set_window 1
        say("survey station link" if showcase else "upper telemetry")
        emit(0xEB, 0x7F, 0)
    label("loop")
    if version == 5:
        emit(0xE2, 0x17, 0x04, 0x00, 1, 0)  # clear initial input length
    emit(0xAA, 16, 0xBB)  # print_obj global0, newline
    if showcase:
        descriptions = [
            "ivory panels glow beneath the arrival beacon",
            "green guide lamps trace a path through the service corridor",
            "the reactor hums behind a wall of dark glass",
            "coolant pipes shimmer in the quiet gallery",
            "beyond the observation window a distant sun burns amber",
            "an antenna rises above the station into the starless dark",
        ]
        for room in range(1, 7):
            equals(16, room, f"description{room}")
        jump("read")
        for room, description in enumerate(descriptions, 1):
            label(f"description{room}")
            say(description)
            jump("read")
        label("read")
    emit(0xE4, 0x0F, 0x04, 0x00, 0x00, 0x00)  # read text buffer, no parse buffer
    if version == 5:
        emit(22)  # read stores terminating key in global6
        emit(0xBE, 9, 0xFF, 21)  # checkpoint before applying the command
        emit(0xC1, 0x9F, 21, 2)  # restored undo result
        branch("loop")
    emit(0x95, 18)  # inc global2 (moves)
    emit(0xD0, 0x1F, 0x04, 0x00, 2 if version == 5 else 1, 19)
    equals(19, "n", "north")
    if showcase:
        equals(19, "e", "east")
        equals(19, "u", "up")
        equals(19, "d", "down")
        equals(19, "w", "west")
    equals(19, "s", "southcheck")
    equals(19, "r", "restore")
    equals(19, "q", "quit")
    jump("loop")
    label("north")
    location(2)
    say("you walk north")
    jump("loop")
    if showcase:
        label("east")
        equals(16, 2, "reactor")
        location(4)
        say("you follow the eastern passage")
        jump("loop")
        label("reactor")
        location(3)
        say("you enter the reactor hall")
        jump("loop")
        for direction, destination, message in [
            ("up", 6, "you climb the ladder into the antenna loft"),
            ("down", 5, "you descend to the observation deck"),
            ("west", 3, "you return toward the reactor hall"),
        ]:
            label(direction)
            location(destination)
            say(message)
            jump("loop")
    label("southcheck")
    emit(0xD0, 0x1F, 0x04, 0x00, 3 if version == 5 else 2, 20)
    equals(20, "a", "save")
    location(5 if showcase else 1)
    say("you walk south")
    jump("loop")
    label("save")
    if version == 5:
        emit(0xBE, 0, 0xFF, 23)  # extended save -> global7
        emit(0xA0, 23)  # jz result
        branch("savefailed")
        jump("saved")
    else:
        emit(0xB5)  # V1-V3 save branches; restore resumes this branch
        branch("saved")
    label("savefailed")
    say("save failed")
    jump("loop")
    label("saved")
    say("save checkpoint reached")
    jump("loop")
    label("restore")
    if version == 5:
        emit(0xBE, 1, 0xFF, 23)  # extended restore -> global7
    else:
        emit(0xB6)
        branch("loop")
    say("restore failed")
    jump("loop")
    label("quit")
    say("survey ended")
    emit(0xBA)

    for address, destination, is_branch in patches:
        offset = labels[destination] - (address + 2) + 2
        encoded = (offset & 0x3FFF) | 0x8000 if is_branch else offset & 0xFFFF
        code[address:address + 2] = encoded.to_bytes(2, "big")
    data[0x600:0x600 + len(code)] = code
    for address, value in ((4, 0x600), (6, 0x600), (14, 0x600), (26, len(data) // (4 if version >= 4 else 2))):
        data[address:address + 2] = value.to_bytes(2, "big")
    data[18:24] = b"WEB001"
    if showcase:
        for index, name in enumerate([
            "arrival bay", "service corridor", "reactor hall",
            "coolant gallery", "observation deck", "antenna loft",
        ]):
            address = 0x500 + index * 32
            encoded = text(name)
            data[address] = len(encoded) // 2
            data[address + 1:address + 1 + len(encoded)] = encoded
            pointer = 0x80 + 62 + index * 9 + 7
            data[pointer:pointer + 2] = address.to_bytes(2, "big")
        data[18:24] = b"WFDEMO"
    dictionary_words = (
        ["antenna", "coolant", "down", "east", "look", "north", "reactor", "south", "station", "up", "west"]
        if showcase else ["garden", "lamp", "lighthouse", "north", "secret", "south"]
    )
    resolution = 9 if version == 5 else 6
    entry_length = 7 if version == 5 else 5
    data[0x480:0x484] = bytes((0, entry_length, 0, len(dictionary_words)))
    for index, word in enumerate(dictionary_words):
        encoded = text(word[:resolution])
        encoded += b"\x14\xa5" * ((resolution * 2 // 3 - len(encoded)) // 2)
        # Dictionary fields have a fixed encoded length, with the end bit only on the last word.
        encoded = bytearray(encoded)
        for offset in range(0, len(encoded), 2):
            encoded[offset] &= 0x7F
        encoded[-2] |= 0x80
        address = 0x484 + index * entry_length
        data[address:address + len(encoded)] = encoded
    data[28:30] = (sum(data[64:]) & 0xFFFF).to_bytes(2, "big")
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for version in (1, 2, 3, 4, 5):
        (args.directory / f"survey.z{version}").write_bytes(interactive(version))
    (args.directory / "timed.z5").write_bytes(interactive(5, timed=True))
    (args.directory / "station.z3").write_bytes(interactive(3, showcase=True))
