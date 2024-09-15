import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Invoice } from '../../entities/invoice.entity';
import { Repository } from 'typeorm';
import { InvoiceStatus } from '../../entities/invoiceStatus.entity';
import { UserEntity } from '../../entities/user.entity';
import { join } from 'path';
import { CreateInvoiceDto } from './dto/create-invoices.dto';
import { existsSync } from 'fs';
import { Response } from 'express';
import { Permission } from 'src/entities/permission.entity';
import { PermissionType } from 'src/entities/permissionType.entity';
import { Company } from 'src/entities/company.entity';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { NotificationsGateway } from 'src/websockets/notifications/notifications.gateway';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { Socket } from 'socket.io';
@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,

    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,

    @InjectRepository(Company)
    private companyRepository: Repository<Company>,

    @InjectRepository(InvoiceStatus)
    private invoiceStatusRepository: Repository<InvoiceStatus>,

    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,

    @InjectRepository(PermissionType)
    private permissionTypeRepository: Repository<PermissionType>,

    private readonly notificationsService: NotificationsService,

    private readonly notificationsGateway: NotificationsGateway,
  ) {}
  // =====================================
  async getAllInvoices() {
    const invoices = await this.invoiceRepository.find({
      relations: {
        user: true,
        company: true,
        invoiceStatus: true,
        permissions: { permissionType: true },
      },
      order: {
        id: 'ASC', // Ordena por id de manera ascendente, puedes cambiar a 'DESC' si deseas orden descendente
      },
    });

    if (!invoices || invoices.length === 0) {
      throw new NotFoundException('No se encontraron facturas');
    }

    return invoices;
  }

  // =====================================
  async checkInvoiceNumberExists(invoiceNumber: string): Promise<boolean> {
    const existingInvoice = await this.invoiceRepository.findOneBy({
      number: invoiceNumber,
    });
    return !!existingInvoice;
  }

  // =====================================
  async updateInvoiceStatus(
    id: number,
    updateInvoiceStatusDto: UpdateInvoiceStatusDto,
    user: number,
  ) {
    const { invoiceStatusId } = updateInvoiceStatusDto;

    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: { invoiceStatus: true, permissions: { user: true } },
    });

    const userTrigger = await this.userRepository.findOneBy({ id: user });

    if (!invoice) {
      throw new NotFoundException(`No se encontró la factura con el ID ${id}`);
    }

    const invoiceStatus = await this.invoiceStatusRepository.findOne({
      where: { id: invoiceStatusId },
    });

    if (!invoiceStatus) {
      throw new NotFoundException(
        `No se encontró el estado de factura con el ID ${invoiceStatusId}`,
      );
    }

    invoice.invoiceStatus = invoiceStatus;
    console.log(invoice);
    invoice.permissions.map((item) => item.user.Names);
    await this.invoiceRepository.save(invoice); // Guarda los cambios
    console.log(invoiceStatus.name);

    if (invoiceStatus.name === 'Revisión' || invoiceStatus.name === 'Pagado') {
      const impactedUser = invoice.permissions.map(
        (permission) => permission.user,
      );
      // Sala para el administrador
      const salaAdmin = 'Admin';

      // Emitir notificación al administrador
      this.notificationsGateway.emitNotificationToUser(salaAdmin, {
        notificationType:
          invoiceStatus.name === 'Revisión'
            ? 'se ha cargado un voucher de pago'
            : 'la factura ya fue revisada y aprobada',
        impactedUser: null,
        triggerUser: userTrigger.Names,
        invoice: { number: invoice.number },
      });
      await this.notificationsService.createNotification({
        invoiceId: id,
        impactedUserId: null,
        notificationTypeId: invoiceStatus.name === 'Revisión' ? 11 : 12,
        triggerUserId: userTrigger.id,
      });
      // Emitir notificación a los usuarios en el array
      impactedUser.forEach(async (user) => {
        const userId = user.id;
        const userRoom = `${userId}`;
        this.notificationsGateway.emitNotificationToUser(userRoom, {
          notificationType:
            invoiceStatus.name === 'Revisión'
              ? 'se ha cargado un voucher de pago'
              : 'la factura ya fue revisada y aprobada',
          impactedUser: { Names: user.Names, LastName: user.LastName },
          triggerUser: userTrigger.Names,
          invoice: { number: invoice.number },
        });
        await this.notificationsService.createNotification({
          invoiceId: id,
          impactedUserId: userId,
          notificationTypeId: invoiceStatus.name === 'Revisión' ? 11 : 12,
          triggerUserId: userTrigger.id,
        });
      });
    }

    return invoice;
  }

  // =====================================
  async createInvoice(createInvoiceDto: CreateInvoiceDto, userId: number) {
    const {
      invoiceNumber,
      path,
      issueDate,
      dueDate,
      amount,
      // userId,
      invoiceStatusId,
      companyId, // Añadido para la relación con Company
    } = createInvoiceDto;

    const existingInvoice = await this.invoiceRepository.findOneBy({
      number: invoiceNumber,
    });
    if (existingInvoice) {
      throw new BadRequestException('Ya existe una factura con este número');
    }

    const invoiceStatus = await this.invoiceStatusRepository.findOneBy({
      id: invoiceStatusId,
    });
    const userTrigger = await this.userRepository.findOneBy({ id: userId });
    const company = companyId
      ? await this.companyRepository.findOneBy({ id: companyId })
      : null;

    if (!invoiceStatus /* || !user */) {
      throw new BadRequestException('invoiceStatus o user no encontrado');
    }

    const invoice = this.invoiceRepository.create({
      number: invoiceNumber,
      path,
      issueDate,
      dueDate,
      amount,
      // user,
      invoiceStatus,
      company,
    });

    const result = await this.invoiceRepository.save(invoice);

    // Sala para el administrador
    const salaAdmin = 'Admin';

    // Emitir notificación al administrador
    this.notificationsGateway.emitNotificationToUser(salaAdmin, {
      notificationType: { name: 'cargar la factura' },
      impactedUser: null,
      triggerUser: userTrigger.Names,
      invoice: { number: result.number },
    });

    await this.notificationsService.createNotification({
      invoiceId: result.id,
      impactedUserId: null,
      notificationTypeId: 6,
      triggerUserId: userTrigger.id,
    });

    return result;
  }

  // =====================================
  async updateInvoice(
    id: number,
    updateInvoiceDto: CreateInvoiceDto,
  ): Promise<Invoice> {
    const {
      invoiceNumber,
      path,
      issueDate,
      dueDate,
      amount,
      userId,
      invoiceStatusId,
      companyId, // Añadido para la relación con Company
    } = updateInvoiceDto;

    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: { user: true, invoiceStatus: true, permissions: true },
    });
    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    if (invoiceNumber && invoiceNumber !== invoice.number) {
      const existingInvoice = await this.invoiceRepository.findOneBy({
        number: invoiceNumber,
      });
      if (existingInvoice) {
        throw new BadRequestException('Ya existe una factura con este número');
      }
    }

    const invoiceStatus = await this.invoiceStatusRepository.findOneBy({
      id: invoiceStatusId,
    });
    const user = await this.userRepository.findOneBy({ id: userId });
    const company = companyId
      ? await this.companyRepository.findOneBy({ id: companyId })
      : null;

    if (!invoiceStatus || !user) {
      throw new BadRequestException('invoiceStatus o user no encontrado');
    }

    invoice.number = invoiceNumber || invoice.number;
    invoice.path = path || invoice.path;
    invoice.issueDate = issueDate || invoice.issueDate;
    invoice.dueDate = dueDate || invoice.dueDate;
    invoice.amount = amount || invoice.amount;
    invoice.user = user;
    invoice.invoiceStatus = invoiceStatus;
    invoice.company = company;
    const data = invoice.permissions.map((permission) => permission.user);
    console.log(data);

    // Sala para el administrador
    const salaAdmin = 'Admin';

    // Emitir notificación al administrador
    this.notificationsGateway.emitNotificationToUser(salaAdmin, {
      notificationType: { name: 'cargar la factura' },
      impactedUser: null,
      triggerUser: user.Names,
      invoice: { number: invoice.number },
    });

    await this.notificationsService.createNotification({
      invoiceId: invoice.id,
      impactedUserId: null,
      notificationTypeId: 8,
      triggerUserId: user.id,
    });

    // Emitir notificación a los usuarios en el array
    data?.forEach(async (ImpactedUser) => {
      const userId = ImpactedUser.id;
      const userRoom = `${userId}`;
      this.notificationsGateway.emitNotificationToUser(userRoom, {
        notificationType: { name: 'editar la factura' },
        impactedUser: { Names: user.Names, LastName: user.LastName },
        triggerUser: user.Names,
        invoice: { number: invoice.number },
      });
      await this.notificationsService.createNotification({
        invoiceId: id,
        impactedUserId: userId,
        notificationTypeId: 8,
        triggerUserId: user.id,
      });
    });
    return this.invoiceRepository.save(invoice);
  }

  // =====================================
  async getInvoiceById(id: number): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['user', 'invoiceStatus', 'company', 'voucher', "permissions"], // Adjust if needed
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  async getInvoicesByUser(
    userId: number = null,
    idsInvoiceStatus: number[],
    page: number = 1,
    pageSize: number = 10,
  ): Promise<Invoice[]> {
    const offset = (page - 1) * pageSize;

    const queryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.invoiceStatus', 'invoiceStatus')
      .leftJoinAndSelect('invoice.user', 'users')
      .leftJoinAndSelect('invoice.company', 'company')
      .select([
        'invoice.id AS "id"',
        'invoice.path AS "invoicePath"',
        'invoice.number AS "invoiceNumber"',
        `TO_CHAR(invoice.issueDate, 'DD-MM-YYYY') AS "invoiceIssueDate"`,
        `TO_CHAR(invoice.dueDate, 'DD-MM-YYYY') AS "invoiceDueDate"`,
        'invoice.amount AS "invoiceAmount"',
        'invoiceStatus.name AS "invoiceStatus"',
        `CASE 
                WHEN invoice.dueDate < CURRENT_DATE THEN true 
                ELSE false 
             END AS "overdueIndicator"`,
      ])
      .orderBy('"invoiceDueDate"', 'DESC')
      .limit(pageSize)
      .offset(offset);

    if (idsInvoiceStatus) {
      queryBuilder.where('invoiceStatus.id IN (:...statusIds)', {
        statusIds: idsInvoiceStatus,
      }); // Maneja el array de IDs
    }

    if (userId) {
      queryBuilder.where('users.id = :userId', { userId });
    }
    const result = await queryBuilder.getRawMany();

    return result;
  }

  async getInvoicesById(id: number) {
    const invoice = await this.invoiceRepository.find({
      where: { permissions: { user: { id: id } } },
      relations: {
        invoiceStatus: true,
        permissions: { permissionType: true },
        company: true,
        user: true,
      },
      order: {
        dueDate: 'DESC',
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    return invoice;
  }

  async getDonwloadInvoicesCopy(
    userId: number,
    invoiceId: number,
    res: Response,
  ) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User does not exist');

    const invoiceCopy = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
    });
    console.log(invoiceCopy.path);

    if (!invoiceCopy) throw new NotFoundException('Invoice does not exist');

    const filePath = join(process.cwd(), invoiceCopy.path);
    console.log(filePath);

    if (!existsSync(invoiceCopy.path)) {
      throw new NotFoundException('Invoice file not found');
    }
    const fileExtension = filePath.split('.').pop();
    let contentType: string;

    switch (fileExtension) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'txt':
        contentType = 'text/plain';
        break;
      default:
        contentType = 'application/octet-stream'; // Tipo genérico para otros archivos
    }

    return { contentType, filePath, invoiceCopy, fileExtension };
  }

  async deleteInvoice(id: number): Promise<void> {
    const invoice = await this.invoiceRepository.findOneBy({ id: id });
    await this.invoiceRepository.remove(invoice);
  }

  async getPermissions(invoiceId: number) {
    const data = await this.permissionsRepository.find({
      where: { invoice: { id: invoiceId } },
      relations: { user: true, permissionType: true },
      select: { permissionType: { name: true, id: true } },
    });

    const permissions = data.map((item) => {
      return {
        userId: item.userId,
        permissionType: item.permissionType,
      };
    });

    return permissions;
  }

  async updatePermissions(
    invoiceId: number,
    newPermission: Permission[],
    userId: number,
  ): Promise<Permission[]> {
    const permissions = await this.permissionsRepository.find({
      relations: { user: true, permissionType: true },
      where: { invoice: { id: invoiceId } },
    });
    if (!permissions) {
      return await this.permissionsRepository.save(newPermission);
    }
    console.log(permissions);
    
    // Convertir a sets para comparación
    const currentPermissionsSet = new Set(
        permissions.map((p) => `${p.userId}-${p.permissionTypeId}`),
    );
    const newPermissionsSet = new Set(
      newPermission.map((p) => `${p.userId}-${p.permissionTypeId}`),
    );

    // Determinar permisos agregados
    const addedPermissions = newPermission.filter(
      (p) => !currentPermissionsSet.has(`${p.userId}-${p.permissionTypeId}`),
    );

    // Determinar permisos eliminados
    const removedPermissions = permissions.filter(
      (p) => !newPermissionsSet.has(`${p.userId}-${p.permissionTypeId}`),
    );

    const user= await this.userRepository.findOneBy({id: userId});
    // Sala para el administrador
    const salaAdmin = 'Admin';
    
    addedPermissions.map(async (perm)=>{
      
      // Emitir notificación al administrador
      this.notificationsGateway.emitNotificationToUser(salaAdmin, {
        notificationType: {name: "otorgar permisos de lectura a la factura"},
        impactedUser: perm.userId,
        triggerUser: user.Names,
        invoice: { number: perm.invoice.number },
      });

      await this.notificationsService.createNotification({
        invoiceId: perm.invoice.id,
        impactedUserId: null,
        notificationTypeId: 0,
        triggerUserId: user.id,
      });

      // Emitir notificación al administrador
      this.notificationsGateway.emitNotificationToUser(perm.userId, {
        notificationType: {name: "otorgar permisos de lectura a la factura"},
        impactedUser: perm.userId,
        triggerUser: user.Names,
        invoice: { number: perm.invoice.number },
      });

      await this.notificationsService.createNotification({
        invoiceId: perm.invoice.id,
        impactedUserId: null,
        notificationTypeId: 0,
        triggerUserId: user.id,
      });

    })



    console.log(addedPermissions, removedPermissions);
    
    await this.permissionsRepository.remove(permissions);

    const result = newPermission.map(async (item) => {
      const permissionObject = this.permissionsRepository.create({
        userId: item.userId,
        permissionTypeId: item.permissionTypeId,
        user: await this.userRepository.findOneBy({ id: Number(item.userId) }),
        permissionType: await this.permissionTypeRepository.findOneBy({
          id: Number(item.permissionTypeId),
        }),
        invoice: await this.invoiceRepository.findOneBy({
          id: invoiceId,
        }),
      });

      return await this.permissionsRepository.save(permissionObject);
    });

    return await Promise.all(result);
  }
}
