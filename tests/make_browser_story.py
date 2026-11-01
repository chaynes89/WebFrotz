"""Original interactive V1-V3 fixtures executing real Z-machine opcodes.

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


def interactive(version):
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
        emit(0xC1, 0x9F, variable, ord(value))
        branch(destination)

    def location(value):
        emit(0xCD, 0x5F, 16, value)  # store global0

    say("webfrotz survey fixture")
    say("type north south save restore look or quit")
    if version == 3:
        emit(0xEA, 0x7F, 2)  # split_window 2
        emit(0xEB, 0x7F, 1)  # set_window 1
        say("upper telemetry")
        emit(0xEB, 0x7F, 0)
    label("loop")
    emit(0xAA, 16, 0xBB)  # print_obj global0, newline
    emit(0xE4, 0x0F, 0x04, 0x00, 0x00, 0x00)  # read text buffer, no parse buffer
    emit(0x95, 18)  # inc global2 (moves)
    emit(0xD0, 0x1F, 0x04, 0x00, 1, 19)  # loadb text[1] -> global3
    equals(19, "n", "north")
    equals(19, "s", "southcheck")
    equals(19, "r", "restore")
    equals(19, "q", "quit")
    jump("loop")
    label("north")
    location(2)
    say("you walk north")
    jump("loop")
    label("southcheck")
    emit(0xD0, 0x1F, 0x04, 0x00, 2, 20)
    equals(20, "a", "save")
    location(1)
    say("you walk south")
    jump("loop")
    label("save")
    emit(0xB5)  # V1-V3 save branches; restore resumes this branch
    branch("saved")
    say("save failed")
    jump("loop")
    label("saved")
    say("save checkpoint reached")
    jump("loop")
    label("restore")
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
    for address, value in ((4, 0x600), (6, 0x600), (14, 0x600), (26, len(data) // 2)):
        data[address:address + 2] = value.to_bytes(2, "big")
    data[18:24] = b"WEB001"
    data[28:30] = (sum(data[64:]) & 0xFFFF).to_bytes(2, "big")
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for version in (1, 2, 3):
        (args.directory / f"survey.z{version}").write_bytes(interactive(version))
