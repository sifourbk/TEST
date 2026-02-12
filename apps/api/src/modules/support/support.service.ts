import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChatSenderType,
  SupportCategory,
  SupportPriority,
  SupportTicketStatus,
  UserRole,
} from '@prisma/client';
import { loadEnv } from '../../config/env';

const ESCALATE_PATTERNS: Array<{ re: RegExp; reason: string; category?: SupportCategory }> = [
  { re: /\bdamage\b/i, reason: 'Damage reported', category: SupportCategory.ORDER },
  { re: /\blost item\b|\bmissing item\b/i, reason: 'Lost item reported', category: SupportCategory.ORDER },
  { re: /\bthreat\b|\bthreaten\b/i, reason: 'Threat reported', category: SupportCategory.SAFETY },
  { re: /\bsafety\b/i, reason: 'Safety concern', category: SupportCategory.SAFETY },
  { re: /\brefused cash\b|\brefuse cash\b/i, reason: 'Cash refusal', category: SupportCategory.ORDER },
  { re: /\bban appeal\b|\bunban\b|\bappeal\b/i, reason: 'Ban appeal', category: SupportCategory.BAN_APPEAL },
];

@Injectable()
export class SupportService {
  private env = loadEnv();

  constructor(private prisma: PrismaService) {}

  async createTicket(user: any, args: { category: SupportCategory; priority: SupportPriority; message: string; orderId?: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        createdById: user.id,
        category: args.category,
        priority: args.priority,
        status: SupportTicketStatus.OPEN,
      },
    });

    await this.prisma.chatMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: user.id,
        senderType: user.role === UserRole.DRIVER ? ChatSenderType.DRIVER : ChatSenderType.CUSTOMER,
        content: args.message,
        meta: args.orderId ? { orderId: args.orderId } : undefined,
      },
    });

    // Run escalation detection on initial message
    await this.maybeEscalate(ticket.id, args.message);

    // AI first response (unless already escalated & taken over is optional)
    await this.aiRespond(ticket.id, args.message, user);

    return this.getTicketForUser(user, ticket.id);
  }

  async userChat(user: any, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.createdById !== user.id) throw new ForbiddenException('Not your ticket');

    await this.prisma.chatMessage.create({
      data: {
        ticketId,
        senderId: user.id,
        senderType: user.role === UserRole.DRIVER ? ChatSenderType.DRIVER : ChatSenderType.CUSTOMER,
        content: message,
      },
    });

    await this.maybeEscalate(ticketId, message);

    // If human has taken over, do not respond as AI
    const fresh = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (fresh?.takenOverById) {
      return this.getTicketForUser(user, ticketId);
    }

    await this.aiRespond(ticketId, message, user);
    return this.getTicketForUser(user, ticketId);
  }

  async listMyTickets(user: any) {
    return this.prisma.supportTicket.findMany({
      where: { createdById: user.id },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTicketForUser(user: any, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.createdById !== user.id) throw new ForbiddenException('Not your ticket');
    return ticket;
  }

  // ---------------- Admin operations ----------------

  async adminListTickets() {
    return this.prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: true },
    });
  }

  async adminGetTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, createdBy: true, takenOverBy: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async adminTakeOver(adminUser: any, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { takenOverById: adminUser.id, status: SupportTicketStatus.ESCALATED },
    });
  }

  async adminReply(adminUser: any, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.takenOverById) throw new BadRequestException('Ticket is not taken over by a human');

    await this.prisma.chatMessage.create({
      data: {
        ticketId,
        senderId: adminUser.id,
        senderType: ChatSenderType.ADMIN,
        content: message,
      },
    });

    return this.adminGetTicket(ticketId);
  }

  // ---------------- AI ----------------

  private async maybeEscalate(ticketId: string, message: string) {
    for (const p of ESCALATE_PATTERNS) {
      if (p.re.test(message)) {
        await this.prisma.supportTicket.update({
          where: { id: ticketId },
          data: {
            status: SupportTicketStatus.ESCALATED,
            escalatedReason: p.reason,
            ...(p.category ? { category: p.category } : {}),
          },
        });
        return;
      }
    }
  }

  private async aiRespond(ticketId: string, userMessage: string, user: any) {
    // In this MVP we keep an explicit mock implementation and a minimal OpenAI implementation.
    const mode = this.env.AI_MODE || 'mock';

    let reply = '';

    if (mode === 'openai' && this.env.OPENAI_API_KEY) {
      // Minimal, production-safe fallback: if OpenAI fails, we degrade to mock.
      try {
        reply = await this.openAiSupportReply(ticketId, userMessage, user.id);
      } catch {
        reply = this.mockSupportReply(userMessage);
      }
    } else {
      reply = this.mockSupportReply(userMessage);
    }

    await this.prisma.chatMessage.create({
      data: {
        ticketId,
        senderType: ChatSenderType.AI,
        content: reply,
      },
    });

    // keep ticket bumped
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  }

  private mockSupportReply(message: string) {
    // Tool-like heuristics
    const orderIdMatch = message.match(/order\s*[:#]?\s*([a-z0-9]{10,})/i);
    if (orderIdMatch) {
      return `I can help with that. Please confirm: are you asking about order ${orderIdMatch[1]}? If yes, tell me what you need (status, driver ETA, cancellation). A human agent will join if needed.`;
    }
    if (/settlement/i.test(message)) {
      return `For settlement questions: settlements are created every Sunday 00:05 (Africa/Algiers) for the previous week (Sun→Sat). If you uploaded proof, it will be reviewed first by AI then by a human. If not verified by Monday 00:00 you may be suspended automatically.`;
    }
    return `Thanks — I can assist 24/7. Please share the order id (if this is order-related) or describe the issue. If it involves safety, threats, damage, lost item, refused cash, or a ban appeal, I will escalate to a human immediately.`;
  }

  private async openAiSupportReply(ticketId: string, userMessage: string, userId: string) {
    // OpenAI Responses API (minimal). We do not implement full tool calling in this MVP; we keep a stable scaffold.
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OpenAI key');

    const f: any = (globalThis as any).fetch;
    if (!f) throw new Error('fetch not available');
    const res = await f('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content:
              'You are Naqlo Support Agent. Be concise. If user mentions damage, lost item, threat, safety, refused cash, or ban appeal, say you escalated to a human.',
          },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const json: any = await res.json();
    const text = json?.output_text;
    if (!text) throw new Error('No output_text');
    return text;
  }
}
