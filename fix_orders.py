
import os

path = 'e:/projects/miraisei/New folder/line-restaurant-api/src/routes/orders.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_until_end_of_route = False
found_first_route = False

i = 0
while i < len(lines):
    line = lines[i]
    
    # Check for the GET /api/orders route
    if "router.get('/'," in line and "Get all orders" in lines[i-1]:
        if not found_first_route:
            found_first_route = True
            # Replace the first route with the filtered version
            new_lines.append("// GET /api/orders - Get all orders with optional date filtering\n")
            new_lines.append("router.get('/', async (req, res) => {\n")
            new_lines.append("  try {\n")
            new_lines.append("    const { startDate, endDate } = req.query;\n")
            new_lines.append("    const db = await getMongoDb();\n")
            new_lines.append("\n")
            new_lines.append("    // Prepare filter query\n")
            new_lines.append("    const query: any = {};\n")
            new_lines.append("    if (startDate || endDate) {\n")
            new_lines.append("      query.createdAt = {};\n")
            new_lines.append("      if (startDate) {\n")
            new_lines.append("        const start = new Date(startDate as string);\n")
            new_lines.append("        if (!isNaN(start.getTime())) query.createdAt.$gte = start;\n")
            new_lines.append("      }\n")
            new_lines.append("      if (endDate) {\n")
            new_lines.append("        const end = new Date(endDate as string);\n")
            new_lines.append("        if (!isNaN(end.getTime())) {\n")
            new_lines.append("          const endOfDay = new Date(end);\n")
            new_lines.append("          endOfDay.setHours(23, 59, 59, 999);\n")
            new_lines.append("          query.createdAt.$lte = endOfDay;\n")
            new_lines.append("        }\n")
            new_lines.append("      }\n")
            new_lines.append("    }\n")
            new_lines.append("\n")
            new_lines.append("    // Fetch orders\n")
            new_lines.append("    const orders = await db.collection('orders')\n")
            new_lines.append("      .find(query)\n")
            new_lines.append("      .sort({ createdAt: -1 })\n")
            new_lines.append("      .toArray();\n")
            
            # Skip the original lines of the first route's initial part
            # (We skipped router.get, try, db, find, filter, sort, toarray)
            # Find line 226 in original: .toArray();
            while i < len(lines) and ".toArray();" not in lines[i]:
                i += 1
            i += 1 # Skip the .toArray(); line itself
            continue
        else:
            # Found the second route, skip it entirely
            # Find the end of this route (starts at line 426, ends at line 497)
            while i < len(lines) and "});" not in lines[i]:
                i += 1
            i += 1 # Skip the }); line
            continue

    new_lines.append(line)
    i += 1

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Orders route updated successfully.")
