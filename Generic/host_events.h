#ifndef FROTZ_HOST_EVENTS_H
#define FROTZ_HOST_EVENTS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum frotz_state_change
{
    FROTZ_STATE_RESTARTED = 1,
    FROTZ_STATE_RESTORED = 2,
    FROTZ_STATE_UNDONE = 3
};

/*
 * Synchronous host notifications, independent of any UI or mapping policy.
 * The status-room hooks bracket the normal name output through os_display_char;
 * hosts must not re-enter the interpreter from these callbacks.
 */
void os_begin_status_room (uint32_t room);
void os_end_status_room (void);
void os_game_state_changed (int reason);
/* A completed line from either keyboard input or command playback.
 * The null-terminated UTF-16 buffer is borrowed for this call only. */
void os_command_submitted (const uint16_t *command);

#ifdef __cplusplus
}
#endif

#endif
