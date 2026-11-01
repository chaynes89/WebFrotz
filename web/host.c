/* WebFrotz asynchronous browser host, 2026-11-01.
 * GPL-2.0-or-later; see COPYING. The interpreter core is unchanged. */
#include "../Generic/frotz.h"
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

extern int frotz_main(int argc, char** argv);
extern void web_map_char(uint16_t character);

EM_ASYNC_JS(int, browser_input, (int maximum, zchar* buffer, int key_only), {
    const result = await Module.host.input(key_only ? "key" : "line", maximum);
    if (!key_only && result.key === 13) {
        const text = result.text.slice(0, maximum);
        for (let i = 0; i < text.length; i++) HEAPU16[(buffer >> 1) + i] = text.charCodeAt(i);
        HEAPU16[(buffer >> 1) + text.length] = 0;
        Module.host.echo(text);
    }
    return result.key;
});

EM_ASYNC_JS(int, browser_file, (int mode), {
    return await Module.host.file(mode);
});

EM_ASYNC_JS(void, browser_yield, (), {
    Module.host.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
});

EMSCRIPTEN_KEEPALIVE int web_run(void)
{
    char* arguments[] = { "webfrotz", "/story.z", NULL };
    return frotz_main(2, arguments);
}

void os_process_arguments(int argc, char** argv)
{
    (void)argc;
    story_name = argv[1];
    option_sound = 0;
}

FILE* os_path_open(const char* name, const char* mode, long* size)
{
    FILE* file = fopen(name, mode);
    if (file) {
        if (fseek(file, 0, SEEK_END) != 0 || (*size = ftell(file)) < 0 ||
            fseek(file, 0, SEEK_SET) != 0)
            os_fatal("Cannot determine story file size");
    }
    return file;
}

void os_init_screen(void)
{
    h_screen_rows = h_screen_height = 30;
    h_screen_cols = h_screen_width = 80;
    h_font_height = h_font_width = 1;
    h_default_foreground = WHITE_COLOUR;
    h_default_background = BLACK_COLOUR;
    if (h_version <= V3)
        h_config |= CONFIG_SPLITSCREEN;
    else {
        h_config = CONFIG_FIXED;
        h_flags &= ~(GRAPHICS_FLAG | MOUSE_FLAG | COLOUR_FLAG | SOUND_FLAG | MENU_FLAG);
        h_interpreter_number = INTERP_APPLE_IIC;
        h_interpreter_version = 'W';
    }
}

void os_fatal(const char* message)
{
    EM_ASM({ Module.host.fatal(Module.UTF8ToString($0)); }, message);
    exit(1);
}

void os_display_char(zchar character)
{
    web_map_char(character);
    EM_ASM({ Module.host.char($0, $1); }, character, cwin);
}

void os_display_string(const zchar* text)
{
    while (*text) {
        if (*text == ZC_NEW_STYLE || *text == ZC_NEW_FONT)
            text += 2;
        else
            os_display_char(*text++);
    }
}

zchar os_read_line(int max, zchar* buffer, int timeout, int width, int continued)
{
    (void)width; (void)continued;
    if (timeout)
        os_fatal("Timed input is not supported in the browser host");
    return (zchar)browser_input(max, buffer, 0);
}

zchar os_read_key(int timeout, int cursor)
{
    (void)cursor;
    if (timeout)
        os_fatal("Timed input is not supported in the browser host");
    return (zchar)browser_input(1, NULL, 1);
}

int os_read_file_name(char* name, const char* default_name, int mode)
{
    (void)default_name;
    if (mode != FILE_SAVE && mode != FILE_RESTORE) {
        EM_ASM({ Module.host.warning("Command recording, script files and auxiliary files are not supported. Use Export transcript for text history."); });
        return 0;
    }
    if (!browser_file(mode))
        return 0;
    strcpy(name, mode == FILE_SAVE ? "/save.qzl" : "/restore.qzl");
    return 1;
}

void os_tick(void)
{
    static unsigned ticks;
    EM_ASM({ Module.host.checkSave(); });
    if (++ticks % 8192 == 0)
        browser_yield();
}

int os_font_data(int font, int* height, int* width)
{
    if (font != TEXT_FONT && font != FIXED_WIDTH_FONT) return 0;
    *height = *width = 1;
    return 1;
}
int os_char_width(zchar c) { return c == ZC_INDENT || c == ZC_GAP ? 3 : 1; }
int os_string_width(const zchar* text)
{
    int width = 0;
    while (*text) {
        if (*text == ZC_NEW_STYLE || *text == ZC_NEW_FONT) text += 2;
        else width += os_char_width(*text++);
    }
    return width;
}
void os_set_cursor(int row, int column)
{
    EM_ASM({ Module.host.cursor($0, $1); }, row, column);
}
void os_erase_area(int top, int left, int bottom, int right, int window)
{
    (void)window;
    EM_ASM({ Module.host.erase($0, $1, $2, $3); }, top, left, bottom, right);
}
void os_window_height(int window, int height)
{
    EM_ASM({ Module.host.windowHeight($0, $1); }, window, height);
}
void os_more_prompt(void) { /* Scrollable transcript does not need pagination. */ }
void os_scroll_area(int top, int left, int bottom, int right, int units)
{ (void)top; (void)left; (void)bottom; (void)right; (void)units; }
void os_scrollback_char(zchar c) { (void)c; }
void os_scrollback_erase(int count) { (void)count; }
int os_random_seed(void)
{
    return EM_ASM_INT({ return (Math.random() * 32767) | 0; });
}
int os_check_unicode(int font, zchar c) { (void)font; (void)c; return 3; }
int os_buffer_screen(int mode) { (void)mode; return 0; }
int os_wrap_window(int window) { return window != 0; }
int os_peek_colour(void) { return BLACK_COLOUR; }
int os_from_true_colour(zword c) { (void)c; return BLACK_COLOUR; }
zword os_to_true_colour(int c) { (void)c; return 0; }
zword os_read_mouse(void) { return 0; }
void os_set_colour(int foreground, int background) { (void)foreground; (void)background; }
void os_set_font(int font) { (void)font; }
void os_set_text_style(int style) { (void)style; }
void os_restart_game(int stage) { (void)stage; }
void os_reset_screen(void) { EM_ASM({ Module.host.flush(); }); }
void os_beep(int number) { (void)number; EM_ASM({ Module.host.warning("Story requested a beep; audio is unavailable."); }); }
int os_picture_data(int picture, int* height, int* width)
{ (void)picture; *height = *width = 0; return 0; }
void os_draw_picture(int picture, int row, int column)
{ (void)picture; (void)row; (void)column; os_fatal("Pictures are unsupported"); }
void os_menu(int action, int menu, const zword* text)
{ (void)action; (void)menu; (void)text; os_fatal("Story menus are unsupported"); }
void os_finish_with_sample(int number) { (void)number; }
void os_prepare_sample(int number) { (void)number; }
void os_stop_sample(int number) { (void)number; }
void os_start_sample(int number, int volume, int repeats, zword routine)
{
    (void)number; (void)volume; (void)repeats; (void)routine;
    EM_ASM({ Module.host.warning("Story requested sound; audio is unavailable."); });
}
