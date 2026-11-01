// WebFrotz browser ABI, 2026-11-01. GPL-2.0-or-later; see COPYING.
#include "../Frontend/AutoMap.h"
#include <emscripten.h>
#include <codecvt>
#include <locale>

static Frontend::AutoMap model;
static Frontend::AutoMap imported;
static bool import_pending;
static std::u16string room_name;
static uint32_t room_id;
static bool capturing;

static void publish()
{
    EM_ASM({ Module.host.beginMap($0); }, model.CurrentRoom() == Frontend::AutoMap::NoRoom
        ? -1 : static_cast<int>(model.CurrentRoom()));
    for (const auto& room : model.Rooms())
    {
        EM_ASM({
            let label = "";
            for (let p = $1 >> 1; HEAPU16[p]; p++) label += String.fromCharCode(HEAPU16[p]);
            let name = "";
            for (let p = $5 >> 1; HEAPU16[p]; p++) name += String.fromCharCode(HEAPU16[p]);
            Module.host.room($0, label, $2, $3, $4, name);
        }, room.object, room.label.c_str(), room.x, room.y, room.z, room.name.c_str());
    }
    for (const auto& connection : model.Connections())
        EM_ASM({ Module.host.connection($0, $1, !!$2, !!$3); },
            connection.from, connection.to, connection.vertical, connection.inferred);
    EM_ASM({ Module.host.endMap(); });
}

extern "C" {
void web_map_import_room(uint32_t object, const char* name, int x, int y, int z)
{
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t> convert;
    imported.ImportRoom(object,convert.from_bytes(name),x,y,z);
    import_pending = true;
}

void web_map_import_connection(int from, int to, int inferred)
{
    imported.ImportConnection(from,to,inferred != 0);
}

void os_begin_status_room(uint32_t room)
{
    room_id = room;
    room_name.clear();
    capturing = true;
}

void web_map_char(uint16_t character)
{
    if (capturing)
        room_name.push_back(static_cast<char16_t>(character));
}

void os_end_status_room(void)
{
    capturing = false;
    const auto start = room_name.find_first_not_of(u" \t\r\n");
    const auto end = room_name.find_last_not_of(u" \t\r\n");
    if (start != std::u16string::npos)
        room_name = room_name.substr(start, end - start + 1);
    else
        room_name.clear();
    if (room_id != 0 && model.ObserveRoom(room_id, room_name))
        publish();
}

void os_command_submitted(const uint16_t* command)
{
    std::u16string copy;
    while (*command)
        copy.push_back(static_cast<char16_t>(*command++));
    model.SubmitCommand(copy);
}

void os_game_state_changed(int reason)
{
    if (reason == 1)
    {
        model.Reset();
        if (import_pending)
        {
            model = std::move(imported);
            import_pending = false;
        }
    }
    else
        model.Restore();
    publish();
    EM_ASM({ Module.host.state($0); }, reason);
}
}
