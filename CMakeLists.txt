cmake_minimum_required(VERSION 3.20)
# WebFrotz, 2026-11-01: retain portable regressions; omit Windows resource/tooling checks.
project(FrotzPortable LANGUAGES C CXX)

include(CTest)
find_package(Python3 REQUIRED COMPONENTS Interpreter)

add_library(frotz_frontend STATIC Frontend/AutoMap.cpp)
target_include_directories(frotz_frontend PUBLIC Frontend)
target_compile_features(frotz_frontend PUBLIC cxx_std_14)

add_library(frotz_core STATIC
  Generic/buffer.c Generic/err.c Generic/fastmem.c Generic/files.c
  Generic/getopt.c Generic/hotkey.c Generic/input.c Generic/main.c
  Generic/math.c Generic/object.c Generic/process.c Generic/quetzal.c
  Generic/random.c Generic/redirect.c Generic/screen.c Generic/sound.c
  Generic/stream.c Generic/table.c Generic/text.c Generic/variable.c)
target_include_directories(frotz_core PUBLIC Generic)
set_target_properties(frotz_core PROPERTIES C_STANDARD 99 C_STANDARD_REQUIRED ON)
set_source_files_properties(Generic/main.c PROPERTIES COMPILE_DEFINITIONS "main=frotz_main")
if(MSVC)
  target_compile_definitions(frotz_core PRIVATE _CRT_SECURE_NO_WARNINGS _CRT_NONSTDC_NO_WARNINGS)
else()
  target_link_libraries(frotz_core PUBLIC m)
endif()

if(BUILD_TESTING)
  add_executable(automap_tests tests/AutoMapTests.cpp)
  target_link_libraries(automap_tests PRIVATE frotz_frontend)
  if(MSVC)
    target_compile_options(frotz_frontend PRIVATE /W4 /WX)
    target_compile_options(automap_tests PRIVATE /W4 /WX)
  else()
    target_compile_options(frotz_frontend PRIVATE -Wall -Wextra -Werror -pedantic)
    target_compile_options(automap_tests PRIVATE -Wall -Wextra -Werror -pedantic)
  endif()
  add_test(NAME automap COMMAND automap_tests)

  add_executable(core_host_tests tests/CoreHostTests.c)
  target_link_libraries(core_host_tests PRIVATE frotz_core)
  set_target_properties(core_host_tests PROPERTIES C_STANDARD 99 C_STANDARD_REQUIRED ON)
  if(MSVC)
    target_compile_definitions(core_host_tests PRIVATE _CRT_SECURE_NO_WARNINGS)
  endif()

  set(story_dir "${CMAKE_CURRENT_BINARY_DIR}/stories")
  add_custom_command(
    OUTPUT "${story_dir}/fixture.z1" "${story_dir}/fixture.z2"
           "${story_dir}/fixture.z3" "${story_dir}/fixture.z5"
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/make_story.py" "${story_dir}"
    DEPENDS tests/make_story.py
    VERBATIM)
  add_custom_target(test_stories DEPENDS "${story_dir}/fixture.z1" "${story_dir}/fixture.z2"
                                        "${story_dir}/fixture.z3" "${story_dir}/fixture.z5")
  add_dependencies(core_host_tests test_stories)
  foreach(version 1 2 3 5)
    add_test(NAME core-v${version} COMMAND core_host_tests "${story_dir}/fixture.z${version}")
  endforeach()
endif()
