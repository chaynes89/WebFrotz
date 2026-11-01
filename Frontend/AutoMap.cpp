#include "AutoMap.h"

#include <algorithm>
#include <stdexcept>

namespace
{
std::u16string LowerAscii(std::u16string text)
{
  for (char16_t& c : text)
    if ((c >= u'A') && (c <= u'Z'))
      c = static_cast<char16_t>(c+u'a'-u'A');
  return text;
}

std::u16string Number(std::uint32_t value)
{
  std::string digits = std::to_string(value);
  return std::u16string(digits.begin(),digits.end());
}
}

namespace Frontend
{
constexpr std::size_t AutoMap::NoRoom;

void AutoMap::ClearCommand()
{
  m_commandPending = false;
  m_directionKnown = false;
  m_directionX = 0;
  m_directionY = 0;
  m_directionZ = 0;
}

void AutoMap::Reset()
{
  m_rooms.clear();
  m_connections.clear();
  m_roomIndex.clear();
  m_positions.clear();
  m_names.clear();
  m_nameKeys.clear();
  m_connectionIndex.clear();
  m_current = NoRoom;
  ClearCommand();
}

void AutoMap::Restore()
{
  // The next location is an observation, not an exit from the previous state.
  m_current = NoRoom;
  ClearCommand();
}

void AutoMap::ImportRoom(RoomId object, const std::u16string& name, int x, int y, int z)
{
  if (object == 0 || m_roomIndex.count(object) ||
      m_positions.count(std::make_tuple(x,y,z)))
    throw std::invalid_argument("Invalid persisted room");
  const auto index = m_rooms.size();
  m_rooms.push_back({object, {}, {}, x, y, z});
  m_nameKeys.emplace_back();
  m_roomIndex.emplace(object,index);
  m_positions.insert(std::make_tuple(x,y,z));
  ChangeName(index,name,LowerAscii(name));
  Restore();
}

void AutoMap::ImportConnection(std::size_t from, std::size_t to, bool inferred)
{
  if (from >= m_rooms.size() || to >= m_rooms.size() || from == to)
    throw std::invalid_argument("Invalid persisted connection");
  const auto key = std::make_pair(std::min(from,to),std::max(from,to));
  if (m_connectionIndex.count(key))
    throw std::invalid_argument("Duplicate persisted connection");
  m_connectionIndex.emplace(key,m_connections.size());
  m_connections.push_back({from, to, m_rooms[from].z != m_rooms[to].z, inferred});
}

void AutoMap::SubmitCommand(const std::u16string& command)
{
  ClearCommand();
  m_commandPending = true;

  std::u16string text = LowerAscii(command);
  auto start = text.find_first_not_of(u" \t\r\n");
  if (start == std::u16string::npos)
    return;
  auto end = text.find_first_of(u" \t\r\n,.",start);
  std::u16string direction = text.substr(start,end-start);
  if ((direction == u"go") || (direction == u"walk") ||
      (direction == u"run") || (direction == u"head") ||
      (direction == u"move") || (direction == u"travel"))
  {
    if (end == std::u16string::npos)
      return;
    start = text.find_first_not_of(u" \t\r\n",end);
    if (start == std::u16string::npos)
      return;
    end = text.find_first_of(u" \t\r\n,.",start);
    direction = text.substr(start,end-start);
  }

  if ((direction == u"n") || (direction == u"north"))
    m_directionY = -1;
  else if ((direction == u"s") || (direction == u"south"))
    m_directionY = 1;
  else if ((direction == u"e") || (direction == u"east"))
    m_directionX = 1;
  else if ((direction == u"w") || (direction == u"west"))
    m_directionX = -1;
  else if ((direction == u"ne") || (direction == u"northeast"))
  {
    m_directionX = 1;
    m_directionY = -1;
  }
  else if ((direction == u"nw") || (direction == u"northwest"))
  {
    m_directionX = -1;
    m_directionY = -1;
  }
  else if ((direction == u"se") || (direction == u"southeast"))
  {
    m_directionX = 1;
    m_directionY = 1;
  }
  else if ((direction == u"sw") || (direction == u"southwest"))
  {
    m_directionX = -1;
    m_directionY = 1;
  }
  else if ((direction == u"u") || (direction == u"up"))
    m_directionZ = 1;
  else if ((direction == u"d") || (direction == u"down"))
    m_directionZ = -1;
  else
    return;

  m_directionKnown = true;
}

void AutoMap::UpdateLabels(const std::u16string& key)
{
  auto group = m_names.find(key);
  if (group == m_names.end())
    return;
  for (std::size_t index : group->second)
  {
    Room& room = m_rooms[index];
    room.label = room.name.empty() ? u"Room #"+Number(room.object) : room.name;
    if (!room.name.empty() && (group->second.size() > 1))
      room.label += u" (#"+Number(room.object)+u")";
  }
}

void AutoMap::ChangeName(std::size_t index, const std::u16string& name, const std::u16string& key)
{
  Room& room = m_rooms[index];
  const std::u16string oldKey = m_nameKeys[index];
  auto oldGroup = m_names.find(oldKey);
  if (oldGroup != m_names.end())
  {
    oldGroup->second.erase(index);
    if (oldGroup->second.empty())
      m_names.erase(oldGroup);
    else
      UpdateLabels(oldKey);
  }

  room.name = name;
  m_nameKeys[index] = key;
  m_names[key].insert(index);
  UpdateLabels(key);
}

bool AutoMap::ObserveRoom(RoomId object, const std::u16string& name)
{
  return ObserveRoom(object,name,LowerAscii(name));
}

bool AutoMap::ObserveRoom(RoomId object, const std::u16string& name, const std::u16string& nameKey)
{
  if (object == 0)
    throw std::invalid_argument("Room identity must be nonzero");

  auto found = m_roomIndex.find(object);
  std::size_t source = m_current;
  std::size_t destination;
  bool changed = false;
  if (found == m_roomIndex.end())
  {
    Room room = { object, {}, {}, 0, 0, 0 };
    if (source != NoRoom)
    {
      const Room& previous = m_rooms[source];
      room.x = previous.x + (m_directionKnown ? m_directionX : 1);
      room.y = previous.y + (m_directionKnown ? m_directionY : 0);
      room.z = previous.z + (m_directionKnown ? m_directionZ : 0);
    }
    while (m_positions.count(std::make_tuple(room.x,room.y,room.z)) != 0)
    {
      room.x += m_directionKnown ? m_directionX : 1;
      room.y += m_directionKnown ? m_directionY : 0;
      room.z += m_directionKnown ? m_directionZ : 0;
    }

    destination = m_rooms.size();
    m_positions.insert(std::make_tuple(room.x,room.y,room.z));
    m_rooms.push_back(room);
    m_nameKeys.emplace_back();
    m_roomIndex.emplace(object,destination);
    ChangeName(destination,name,nameKey);
    changed = true;
  }
  else
  {
    destination = found->second;
    if ((m_rooms[destination].name != name) || (m_nameKeys[destination] != nameKey))
    {
      ChangeName(destination,name,nameKey);
      changed = true;
    }
  }

  if (source != destination)
  {
    if ((source != NoRoom) && m_commandPending)
    {
      auto key = std::make_pair(std::min(source,destination),std::max(source,destination));
      auto connection = m_connectionIndex.find(key);
      if (connection == m_connectionIndex.end())
      {
        m_connectionIndex.emplace(key,m_connections.size());
        m_connections.push_back({ source, destination,
          m_rooms[source].z != m_rooms[destination].z, !m_directionKnown });
      }
      else if (m_directionKnown)
        m_connections[connection->second].inferred = false;
    }
    m_current = destination;
    ClearCommand();
    changed = true;
  }
  return changed;
}
}
