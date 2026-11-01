#include "AutoMap.h"

#include <iostream>
#include <stdexcept>

using Frontend::AutoMap;

#define REQUIRE(condition) \
  do { if (!(condition)) throw std::runtime_error( \
    std::string(__func__)+":"+std::to_string(__LINE__)+": "+#condition); } while (false)

void Directions()
{
  struct Direction { const char16_t* command; int x; int y; int z; };
  const Direction directions[] = {
    { u"n",0,-1,0 }, { u" NORTH ",0,-1,0 }, { u"go north",0,-1,0 },
    { u"s",0,1,0 }, { u"south",0,1,0 }, { u"walk south",0,1,0 },
    { u"e",1,0,0 }, { u"east",1,0,0 }, { u"run east",1,0,0 },
    { u"w",-1,0,0 }, { u"west",-1,0,0 }, { u"head west",-1,0,0 },
    { u"ne",1,-1,0 }, { u"northeast",1,-1,0 }, { u"move northeast",1,-1,0 },
    { u"nw",-1,-1,0 }, { u"northwest",-1,-1,0 }, { u"travel northwest",-1,-1,0 },
    { u"se",1,1,0 }, { u"southeast",1,1,0 },
    { u"sw",-1,1,0 }, { u"southwest",-1,1,0 },
    { u"u",0,0,1 }, { u"up",0,0,1 }, { u"d",0,0,-1 }, { u"down",0,0,-1 }
  };
  for (const auto& direction : directions)
  {
    AutoMap map;
    REQUIRE(map.ObserveRoom(1,u"Start"));
    map.SubmitCommand(direction.command);
    map.ObserveRoom(2,u"Destination");
    const auto& room = map.Rooms()[1];
    REQUIRE(room.x == direction.x);
    REQUIRE(room.y == direction.y);
    REQUIRE(room.z == direction.z);
    REQUIRE(map.Connections().size() == 1);
    REQUIRE(!map.Connections()[0].inferred);
    REQUIRE(map.Connections()[0].vertical == (direction.z != 0));
  }
}

void StatusRefreshAndFailedMovement()
{
  AutoMap map;
  map.ObserveRoom(1,u"Start");
  map.SubmitCommand(u"north");
  REQUIRE(!map.ObserveRoom(1,u"Start"));
  REQUIRE(map.ObserveRoom(1,u"Renamed"));
  map.ObserveRoom(2,u"North");
  REQUIRE(map.Rooms()[1].y == -1);
  map.SubmitCommand(u"north");
  map.ObserveRoom(2,u"North");
  map.SubmitCommand(u"east");
  map.ObserveRoom(3,u"East");
  REQUIRE(map.Rooms()[2].x == 1);
  REQUIRE(map.Rooms()[2].y == -1);
}

void InferenceAndRevisits()
{
  AutoMap map;
  map.ObserveRoom(1,u"Start");
  map.SubmitCommand(u"enter door");
  map.ObserveRoom(2,u"Other");
  REQUIRE(map.Connections()[0].inferred);
  map.SubmitCommand(u"west");
  map.ObserveRoom(1,u"Start");
  REQUIRE(!map.Connections()[0].inferred);
  map.SubmitCommand(u"enter door");
  map.ObserveRoom(2,u"Other");
  REQUIRE(!map.Connections()[0].inferred);
  REQUIRE(map.Rooms().size() == 2);
  REQUIRE(map.Connections().size() == 1);
}

void RestoreAndRestart()
{
  AutoMap map;
  map.ObserveRoom(1,u"Start");
  map.SubmitCommand(u"east");
  map.ObserveRoom(2,u"Middle");
  map.SubmitCommand(u"east");
  map.ObserveRoom(3,u"End");
  map.SubmitCommand(u"north");
  map.Restore();
  REQUIRE(map.CurrentRoom() == AutoMap::NoRoom);
  map.ObserveRoom(1,u"Start");
  REQUIRE(map.Connections().size() == 2);
  map.SubmitCommand(u"north");
  map.ObserveRoom(4,u"North");
  REQUIRE(map.Rooms()[3].x == 0);
  REQUIRE(map.Rooms()[3].y == -1);
  map.Restore();
  map.ObserveRoom(5,u"External save");
  REQUIRE(map.Connections().size() == 3);
  REQUIRE(map.Rooms()[4].x != 0 || map.Rooms()[4].y != 0);
  map.Reset();
  REQUIRE(map.Rooms().empty());
  REQUIRE(map.Connections().empty());
  REQUIRE(map.CurrentRoom() == AutoMap::NoRoom);
  map.ObserveRoom(1,u"New game");
  REQUIRE(map.Rooms()[0].x == 0);
  REQUIRE(map.Rooms()[0].y == 0);
  REQUIRE(map.Rooms()[0].label == u"New game");
}

void Labels()
{
  AutoMap map;
  map.ObserveRoom(1,u"Hall");
  map.ObserveRoom(2,u"HALL");
  REQUIRE(map.Rooms()[0].label == u"Hall (#1)");
  REQUIRE(map.Rooms()[1].label == u"HALL (#2)");
  map.ObserveRoom(2,u"Garden");
  REQUIRE(map.Rooms()[0].label == u"Hall");
  REQUIRE(map.Rooms()[1].label == u"Garden");
  map.ObserveRoom(3,u"");
  REQUIRE(map.Rooms()[2].label == u"Room #3");
  map.ObserveRoom(4,u"Caf\u00e9",u"caf\u00e9");
  map.ObserveRoom(5,u"CAF\u00c9",u"caf\u00e9");
  REQUIRE(map.Rooms()[3].label == u"Caf\u00e9 (#4)");
  REQUIRE(map.Rooms()[4].label == u"CAF\u00c9 (#5)");
  REQUIRE(map.Connections().empty());
}

void CollisionsAndLargeMap()
{
  AutoMap map;
  for (AutoMap::RoomId id = 1; id <= 1000; ++id)
  {
    std::string digits = std::to_string(id);
    std::u16string name(digits.begin(),digits.end());
    map.SubmitCommand(u"east");
    map.ObserveRoom(id,name);
    REQUIRE(map.Rooms().back().x == static_cast<int>(id-1));
    REQUIRE(map.Rooms().back().label == name);
  }
  REQUIRE(map.Connections().size() == 999);
  map.Restore();
  map.ObserveRoom(1,u"1");
  map.SubmitCommand(u"east");
  map.ObserveRoom(1001,u"Collision");
  REQUIRE(map.Rooms().back().x == 1000);
}

void InvalidIdentity()
{
  AutoMap map;
  bool rejected = false;
  try { map.ObserveRoom(0,u"Invalid"); }
  catch (const std::invalid_argument&) { rejected = true; }
  REQUIRE(rejected);
  REQUIRE(map.Rooms().empty());
}

int main()
{
  try
  {
    Directions();
    StatusRefreshAndFailedMovement();
    InferenceAndRevisits();
    RestoreAndRestart();
    Labels();
    CollisionsAndLargeMap();
    InvalidIdentity();
    std::cout << "Auto-map regression tests passed\n";
    return 0;
  }
  catch (const std::exception& error)
  {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
