import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { PrismaClient, SupportTicketStatus, ChatSenderType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function login(server: any, phone: string, role?: 'CUSTOMER' | 'DRIVER' | 'ADMIN') {
  await request(server).post('/auth/request-otp').send({ phone });
  const res = await request(server).post('/auth/verify-otp').send({ phone, otp: '123456', role });
  return res.body.accessToken as string;
}

describe('Support Agent + Escalation + Takeover (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await prisma.chatMessage.deleteMany();
    await prisma.supportTicket.deleteMany();
    // keep seeded admin; remove test users
    await prisma.user.deleteMany({ where: { role: { in: [UserRole.CUSTOMER, UserRole.DRIVER] } } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('escalates on safety keywords and allows admin takeover + reply', async () => {
    const srv = app.getHttpServer();
    const customerToken = await login(srv, '+213777000001', 'CUSTOMER');

    const created = await request(srv)
      .post('/support/tickets')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ category: 'GENERAL', priority: 'MEDIUM', message: 'There was damage to my item' })
      .expect(201);

    const ticketId = created.body.id;
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { messages: true } });
    if (!ticket) throw new Error('ticket missing');
    expect(ticket.status).toBe(SupportTicketStatus.ESCALATED);
    // ensure AI responded at least once
    expect(ticket.messages.some((m) => m.senderType === ChatSenderType.AI)).toBe(true);

    const adminToken = await login(srv, '+213000000000', 'ADMIN');
    await request(srv)
      .post(`/admin/support/tickets/${ticketId}/takeover`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    await request(srv)
      .post(`/admin/support/tickets/${ticketId}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Human agent here. Sorry about the damage — we will help.' })
      .expect(201);

    const t2 = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { messages: true } });
    if (!t2) throw new Error('ticket missing');
    expect(t2.messages.some((m) => m.senderType === ChatSenderType.ADMIN)).toBe(true);
  });
});
