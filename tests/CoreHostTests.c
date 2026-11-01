#include "frotz.h"

#include <stdlib.h>
#include <string.h>

extern void interpret(void);
extern void init_memory(void);
extern void init_process(void);
extern void init_sound(void);
extern void init_undo(void);
extern void reset_memory(void);
extern int save_undo(void);
extern int restore_undo(void);

static unsigned state_events[4];
static unsigned room_events;
static unsigned room_characters;
static unsigned visible_characters;
static unsigned input_requests;
static unsigned command_events;
static int capturing;
static int cancel_file;
static int expect_replay_prompt;
static uint32_t room_identity;
static zchar room_name[128];
static char save_path[MAX_FILE_NAME + 1];
static char aux_path[MAX_FILE_NAME + 1];
static char replay_path[MAX_FILE_NAME + 1];

#define REQUIRE(condition) \
    do { if (!(condition)) { \
        fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); exit(1); \
    } } while (0)

static zword location(void)
{
    zword value;
    LOW_WORD(h_globals, value)
    return value;
}

static void result_position(void)
{
    pcp = zmp + 0x580;
}

void os_begin_status_room(uint32_t room)
{
    REQUIRE(!capturing);
    capturing = 1;
    room_identity = room;
    room_characters = 0;
}

void os_end_status_room(void)
{
    REQUIRE(capturing);
    capturing = 0;
    room_name[room_characters] = 0;
    room_events++;
}

void os_game_state_changed(int reason)
{
    REQUIRE(reason >= FROTZ_STATE_RESTARTED && reason <= FROTZ_STATE_UNDONE);
    state_events[reason]++;
}

void os_command_submitted(const uint16_t* command)
{
    static const uint16_t expected[] = { 'l','o','o','k',0 };
    REQUIRE(memcmp(command, expected, sizeof expected) == 0);
    command_events++;
}

void os_display_char(zchar c)
{
    visible_characters++;
    if (capturing)
    {
        REQUIRE(room_characters + 1 < sizeof room_name / sizeof room_name[0]);
        room_name[room_characters++] = c;
    }
}

void os_display_string(const zchar* text)
{
    while (*text)
    {
        if ((*text == ZC_NEW_STYLE) || (*text == ZC_NEW_FONT))
            text += 2;
        else
            os_display_char(*text++);
    }
}

void os_process_arguments(int argc, char* argv[])
{
    REQUIRE(argc == 2);
    REQUIRE(strlen(argv[1]) + 5 <= MAX_FILE_NAME);
    story_name = argv[1];
    strcpy(save_path, argv[1]);
    strcat(save_path, ".sav");
    strcpy(aux_path, argv[1]);
    strcat(aux_path, ".aux");
    strcpy(replay_path, argv[1]);
    strcat(replay_path, ".rec");
}

FILE* os_path_open(const char* name, const char* mode, long* size)
{
    FILE* file = fopen(name, mode);
    if (file != NULL)
    {
        REQUIRE(fseek(file, 0, SEEK_END) == 0);
        *size = ftell(file);
        REQUIRE(*size >= 0);
        REQUIRE(fseek(file, 0, SEEK_SET) == 0);
    }
    return file;
}

void os_init_screen(void)
{
    h_screen_rows = h_screen_height = 25;
    h_screen_cols = h_screen_width = 80;
    h_font_height = h_font_width = 1;
    h_default_foreground = WHITE_COLOUR;
    h_default_background = BLACK_COLOUR;
}

void os_fatal(const char* message)
{
    fprintf(stderr, "Headless host: %s\n", message);
    exit(1);
}

int os_font_data(int font, int* height, int* width)
{
    if ((font != TEXT_FONT) && (font != FIXED_WIDTH_FONT))
        return 0;
    *height = *width = 1;
    return 1;
}

int os_char_width(zchar c) { return c == ZC_INDENT || c == ZC_GAP ? 3 : 1; }
int os_string_width(const zchar* text)
{
    int width = 0;
    while (*text)
    {
        if ((*text == ZC_NEW_STYLE) || (*text == ZC_NEW_FONT))
            text += 2;
        else
            width += os_char_width(*text++);
    }
    return width;
}

int os_read_file_name(char* name, const char* default_name, int mode)
{
    (void)default_name;
    if (cancel_file)
        return 0;
    REQUIRE(mode == FILE_SAVE || mode == FILE_RESTORE || mode == FILE_LOAD_AUX || mode == FILE_PLAYBACK);
    strcpy(name, mode == FILE_LOAD_AUX ? aux_path : mode == FILE_PLAYBACK ? replay_path : save_path);
    return 1;
}

zchar os_read_line(int max, zchar* buffer, int timeout, int width, int continued)
{
    static const zchar command[] = { 'l','o','o','k',0 };
    (void)timeout; (void)width; (void)continued;
    REQUIRE(max >= 4);
    memcpy(buffer, command, sizeof command);
    input_requests++;
    return ZC_RETURN;
}

int os_random_seed(void) { return 1; }
int os_check_unicode(int font, zchar c) { (void)font; (void)c; return 3; }
int os_buffer_screen(int mode) { (void)mode; return 0; }
int os_picture_data(int picture, int* height, int* width)
{
    (void)picture; *height = *width = 0; return 0;
}
int os_peek_colour(void) { return BLACK_COLOUR; }
int os_from_true_colour(zword colour) { (void)colour; return BLACK_COLOUR; }
zword os_to_true_colour(int colour) { (void)colour; return 0; }
zword os_read_mouse(void) { return 0; }
void os_set_colour(int foreground, int background) { (void)foreground; (void)background; }
void os_set_cursor(int row, int column) { (void)row; (void)column; }
void os_set_font(int font) { (void)font; }
void os_set_text_style(int style) { (void)style; }
void os_restart_game(int stage) { (void)stage; }
void os_reset_screen(void) {}
void os_tick(void) {}
void os_window_height(int window, int height) { (void)window; (void)height; }
int os_wrap_window(int window) { (void)window; return 0; }
void os_erase_area(int top, int left, int bottom, int right, int window)
{ (void)top; (void)left; (void)bottom; (void)right; (void)window; }
void os_scroll_area(int top, int left, int bottom, int right, int units)
{ (void)top; (void)left; (void)bottom; (void)right; (void)units; }
void os_scrollback_char(zchar c) { (void)c; }
void os_scrollback_erase(int count) { (void)count; }

/* These capabilities are deliberately unavailable in the fixture host. */
void os_beep(int number) { (void)number; os_fatal("Unexpected beep"); }
void os_draw_picture(int picture, int row, int column)
{ (void)picture; (void)row; (void)column; os_fatal("Unexpected picture"); }
void os_menu(int action, int menu, const zword* text)
{ (void)action; (void)menu; (void)text; os_fatal("Unexpected menu"); }
void os_more_prompt(void) { os_fatal("Unexpected more prompt"); }
zchar os_read_key(int timeout, int cursor)
{
    (void)timeout; (void)cursor;
    REQUIRE(expect_replay_prompt);
    expect_replay_prompt = 0;
    return 'n';
}
void os_finish_with_sample(int number) { (void)number; os_fatal("Unexpected sound"); }
void os_prepare_sample(int number) { (void)number; os_fatal("Unexpected sound"); }
void os_start_sample(int number, int volume, int repeats, zword routine)
{ (void)number; (void)volume; (void)repeats; (void)routine; os_fatal("Unexpected sound"); }
void os_stop_sample(int number) { (void)number; os_fatal("Unexpected sound"); }

int main(int argc, char* argv[])
{
    FILE* auxiliary;
    unsigned before;
    static const zchar expected_name[] = { ' ','f','o','y','e','r',0 };
    os_process_arguments(argc, argv);
    init_buffer();
    init_err();
    init_memory();
    init_process();
    init_sound();
    os_init_screen();
    init_undo();
    z_restart();
    interpret();

    REQUIRE(state_events[FROTZ_STATE_RESTARTED] == 1);
    REQUIRE(room_events == (h_version <= V3 ? 1u : 0u));
    if (h_version <= V3)
    {
        REQUIRE(room_identity == 1);
        REQUIRE(memcmp(room_name, expected_name, sizeof expected_name) == 0);
        REQUIRE(visible_characters >= room_characters);
    }

    REQUIRE(restore_undo() == 0);
    REQUIRE(state_events[FROTZ_STATE_UNDONE] == 0);
    REQUIRE(save_undo() == 1);
    SET_WORD(h_globals, 2)
    REQUIRE(restore_undo() == 2);
    REQUIRE(location() == 1);
    REQUIRE(state_events[FROTZ_STATE_UNDONE] == 1);
    REQUIRE(restore_undo() == 0);
    REQUIRE(state_events[FROTZ_STATE_UNDONE] == 1);

    result_position();
    zargc = 0;
    z_save();
    SET_WORD(h_globals, 2)
    pcp = zmp + 0x582;
    z_restore();
    REQUIRE(location() == 1);
    REQUIRE(state_events[FROTZ_STATE_RESTORED] == 1);
    SET_WORD(h_globals, 2)
    cancel_file = 1;
    result_position();
    z_restore();
    cancel_file = 0;
    REQUIRE(location() == 2);
    REQUIRE(state_events[FROTZ_STATE_RESTORED] == 1);

    auxiliary = fopen(aux_path, "wb");
    REQUIRE(auxiliary != NULL);
    REQUIRE(fwrite("ABCD", 1, 4, auxiliary) == 4);
    REQUIRE(fclose(auxiliary) == 0);
    zargc = 2;
    zargs[0] = 0x470;
    zargs[1] = 4;
    result_position();
    z_restore();
    REQUIRE(memcmp(zmp + 0x470, "ABCD", 4) == 0);
    REQUIRE(state_events[FROTZ_STATE_RESTORED] == 1);

    before = room_events;
    z_show_status();
    REQUIRE(room_events == before + (h_version <= V3 ? 1u : 0u));
    result_position();
    zargs[0] = 0x400;
    zargs[1] = 0;
    zargc = 2;
    z_read();
    REQUIRE(input_requests == 1);
    REQUIRE(command_events == 1);
    REQUIRE(memcmp(zmp + 0x400 + (h_version <= V4 ? 1 : 2), "look", 4) == 0);

    auxiliary = fopen(replay_path, "wb");
    REQUIRE(auxiliary != NULL);
    REQUIRE(fwrite("look\n", 1, 5, auxiliary) == 5);
    REQUIRE(fclose(auxiliary) == 0);
    zargc = 1;
    zargs[0] = 1;
    expect_replay_prompt = 1;
    z_input_stream();
    REQUIRE(istream_replay);
    REQUIRE(!expect_replay_prompt);
    result_position();
    zargs[0] = 0x400;
    zargs[1] = 0;
    zargc = 2;
    z_read();
    REQUIRE(input_requests == 1);
    REQUIRE(command_events == 2);
    zargs[0] = 0;
    z_input_stream();
    REQUIRE(!istream_replay);

    z_restart();
    REQUIRE(location() == 1);
    REQUIRE(state_events[FROTZ_STATE_RESTARTED] == 2);
    reset_memory();
    REQUIRE(remove(save_path) == 0);
    REQUIRE(remove(aux_path) == 0);
    REQUIRE(remove(replay_path) == 0);
    printf("V%d core host notifications, save/restore, undo and input passed\n", h_version);
    return 0;
}
