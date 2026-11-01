#pragma once

#include <cstddef>
#include <cstdint>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <unordered_map>
#include <vector>

namespace Frontend
{
class AutoMap
{
public:
  using RoomId = std::uint32_t;
  static constexpr std::size_t NoRoom = static_cast<std::size_t>(-1);

  struct Room
  {
    RoomId object;
    std::u16string name;
    std::u16string label;
    int x;
    int y;
    int z;
  };

  struct Connection
  {
    std::size_t from;
    std::size_t to;
    bool vertical;
    bool inferred;
  };

  void Reset();
  void Restore();
  void ImportRoom(RoomId object, const std::u16string& name, int x, int y, int z);
  void ImportConnection(std::size_t from, std::size_t to, bool inferred);
  void SubmitCommand(const std::u16string& command);
  bool ObserveRoom(RoomId object, const std::u16string& name);
  bool ObserveRoom(RoomId object, const std::u16string& name, const std::u16string& nameKey);

  const std::vector<Room>& Rooms() const { return m_rooms; }
  const std::vector<Connection>& Connections() const { return m_connections; }
  std::size_t CurrentRoom() const { return m_current; }

private:
  void ClearCommand();
  void ChangeName(std::size_t room, const std::u16string& name, const std::u16string& key);
  void UpdateLabels(const std::u16string& key);

  std::vector<Room> m_rooms;
  std::vector<Connection> m_connections;
  std::unordered_map<RoomId,std::size_t> m_roomIndex;
  std::set<std::tuple<int,int,int>> m_positions;
  std::map<std::u16string,std::set<std::size_t>> m_names;
  std::vector<std::u16string> m_nameKeys;
  std::map<std::pair<std::size_t,std::size_t>,std::size_t> m_connectionIndex;
  std::size_t m_current = NoRoom;
  bool m_commandPending = false;
  bool m_directionKnown = false;
  int m_directionX = 0;
  int m_directionY = 0;
  int m_directionZ = 0;
};
}
