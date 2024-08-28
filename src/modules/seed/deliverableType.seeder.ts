import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliverableType } from '../../entities/deliverableType.entity';

@Injectable()
export class DeliverableTypeSeeder {
  constructor(
    @InjectRepository(DeliverableType)
    private readonly deliverableTypeRepository: Repository<DeliverableType>,
  ) {}

  async seedDeliverableType() {
    const deliverableTypeData = [];

    if(await this.deliverableTypeRepository.count() > 0) {
      return;
    }

    let deliverableType = new DeliverableType();
    deliverableType.name = "pdf"
    deliverableTypeData.push(deliverableType);

    deliverableType = new DeliverableType();
    deliverableType.name = "docx"
    deliverableTypeData.push(deliverableType);

    deliverableType = new DeliverableType();
    deliverableType.name = "jpg"
    deliverableTypeData.push(deliverableType);

    await this.deliverableTypeRepository.save(deliverableTypeData);
    console.info('Seeded deliverable type Data');
  }
}