import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  try {
    console.log('Querying Organizations...');
    const orgs = await prisma.organization.findMany({
      include: { parent: true, children: true },
      orderBy: { name: 'asc' }
    });
    console.log('Found orgs:', orgs.length);

    console.log('Querying Information Objects...');
    const info = await prisma.informationObject.findMany({
      include: { businessOwner: true, appOwner: true },
      orderBy: { name: 'asc' }
    });
    console.log('Found info objects:', info.length);

    console.log('Querying Integrations...');
    const integrations = await prisma.integration.findMany({
      include: {
        sourceApp: true,
        targetApp: true,
        payload: true,
      },
    });
    console.log('Found integrations:', integrations.length);

  } catch (err) {
    console.error('CRASH DURING QUERY:');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
test();
