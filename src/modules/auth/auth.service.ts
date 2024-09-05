import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { hashPassword, isValidPassword } from '../../utils/hash';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { MailService } from '../mail/mail.service';
import { SignUpDto } from 'src/interfaces/dtos/signup.dto';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private mailService: MailService, // Inject MailService
  ) {}

    // Método para verificar si el correo electrónico ya existe
    async checkEmailExists(email: string): Promise<boolean> {
      const user = await this.userRepository.findOne({ where: { email: email } });
      return !!user;
    }

  async signIn(email: string, password: string): Promise<UserEntity | null> {
    const user = await this.userRepository.findOne({ where: { email: email } });

    if (!user) throw new BadRequestException('Verification Failed');
    if (user.statusId === 1) {
      const validPassword = await isValidPassword(password, user.password);
      if (!validPassword) throw new BadRequestException('Verification Failed');
      return user;
    } else {
      throw new BadRequestException('User no Active');
    }
  }

  async signUpService(body: SignUpDto) {
    console.log('body', body);

    const userExists = await this.userRepository.findOne({
      where: { email: body.email },
    });
    if (userExists) throw new BadRequestException('User already exists');

    const plainPassword = body.password; // Guardar la contraseña sin cifrar
    const hashedPassword = await hashPassword(body.password);
    body.password = hashedPassword;

    const user = this.userRepository.create(body);
    const userSave = await this.userRepository.save(user);

    // Función para cifrar un mensaje usando XOR y convertirlo a hexadecimal
    function encryptToHex(text: string, key: string) {
      let encryptedHex = '';
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        encryptedHex += charCode.toString(16).padStart(2, '0'); // Convierte a hexadecimal y rellena con ceros si es necesario
      }
      return encryptedHex;
    }

    // Cifrar el mensaje
    const encryptedHexMessage = encryptToHex(body.email, 'secretkey');

    // Utiliza el dominio recibido desde el frontend
    const resetLink = `${body.domain}/forgotPassword/${encryptedHexMessage}`;

    // URL de la imagen que deseas incluir en el correo (asegúrate de que sea accesible públicamente)
    const logoUrl = 'https://i.postimg.cc/BZ5YWZCk/bpventures-logo.png'; // Reemplaza con la URL real de tu imagen

    // // Crear el contenido HTML del correo
    // const htmlContent = `
    //   <div style="font-family: Arial, sans-serif; line-height: 1.6;">
    //     <div style="text-align: center; margin-bottom: 20px;">
    //       <img src="${logoUrl}" alt="BP Ventures Logo" style="max-width: 200px;">
    //     </div>
    //     <h2>Hola ${body.Names},</h2>
    //     <p>¡Gracias por registrarte en <strong>BP Ventures</strong>! A continuación, encontrarás tus datos de inicio de sesión:</p>
    //     <p>
    //       <strong>Web:</strong> ${body.domain}<br><br>
    //        <strong>Email:</strong> ${body.email}<br>
    //        <strong>Contraseña:</strong> ${plainPassword}<br>
    //     </p>
    //     <p>Puedes restablecer tu contraseña utilizando el siguiente enlace:</p>
    //     <p><a href="${resetLink}" style="color: #1a73e8;">Restablecer Contraseña</a></p>
    //     <p>¡Bienvenido a nuestro equipo!</p>
    //     <p>Saludos cordiales,<br>Equipo de BP Ventures</p>
    //   </div>
    // `;

        // Contenido HTML
        const htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
          <h1>Registro Exitoso!</h1>
          <p>Hola ${body.Names},</p>
          <p>¡Gracias por registrarte en <strong>BP Ventures</strong>! A continuación, encontrarás tus datos de inicio de sesión:</p>
          <p>
          <strong>Web:</strong> ${body.domain}<br><br>
           <strong>Email:</strong> ${body.email}<br>
           <strong>Contraseña:</strong> ${plainPassword}<br>
          </p>
          <p>Puedes restablecer tu contraseña utilizando el siguiente enlace:</p>
          <a href="${resetLink}" style="display: inline-block; padding: 10px 15px; color: #fff; background-color: #007bff; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
          <p>¡Bienvenido a nuestro equipo!</p>
          <p>Saludos cordiales,<br>Equipo de BP Ventures</p>
          <img src="https://i.postimg.cc/BZ5YWZCk/bpventures-logo.png" alt="BP Ventures" style="max-width: 600px; margin-top: 20px;">
        </div>
      `;

    // Opcional: Crear una versión de texto plano del correo (para clientes de correo que no soporten HTML)
    const textContent = `
  Hola ${body.Names},

  ¡Gracias por registrarte en BP Ventures! A continuación, te proporcionamos tus datos de acceso:

  Correo electrónico: ${body.email}
  Contraseña: ${plainPassword}

  Puedes restablecer tu contraseña utilizando el siguiente enlace:
  ${resetLink}

  Saludos cordiales,
  Equipo de BP Ventures
`;

    // Enviar el correo electrónico con contenido HTML y texto plano alternativo
    await this.mailService.sendMail(
      body.email,
      'Bienvenido a BP Ventures - Sus datos de inicio de sesión',
      textContent, // Texto plano
      htmlContent, // Contenido HTML
    );

    return { userSave, encryptedHexMessage };
  }

  async forgotMyPassword(email: string, domain: string) {
    try {
      const userExists = await this.userRepository.findOne({
        where: { email: email },
      });
      if (!userExists) throw new BadRequestException('El usuario no existe');

      // Función para cifrar un mensaje usando XOR y convertirlo a hexadecimal
      function encryptToHex(text: string, key: string) {
        let encryptedHex = '';
        for (let i = 0; i < text.length; i++) {
          const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
          encryptedHex += charCode.toString(16).padStart(2, '0');
        }
        return encryptedHex;
      }

      const encryptedHexMessage = encryptToHex(email, 'secretkey');
      const resetLink = `${domain}/forgotPassword/${encryptedHexMessage}`;

      // Contenido en texto plano
      const textContent = `Hola ${userExists.Names},\n\nPuedes restablecer tu contraseña utilizando el siguiente enlace:\n\n${resetLink}\n\nSi no solicitaste un restablecimiento de contraseña, ignora este correo.\n\nSaludos cordiales,\nEquipo de BP Ventures`;

      // Contenido HTML
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
          <h1>Solicitud de Restablecimiento de Contraseña</h1>
          <p>Hola ${userExists.Names},</p>
          <p>Puedes restablecer tu contraseña utilizando el siguiente enlace:</p>
          <a href="${resetLink}" style="display: inline-block; padding: 10px 15px; color: #fff; background-color: #007bff; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
          <p>Si no solicitaste un restablecimiento de contraseña, ignora este correo.</p>
          <p>Saludos cordiales,<br>Equipo de BP Ventures</p>
          <img src="https://i.postimg.cc/BZ5YWZCk/bpventures-logo.png" alt="BP Ventures" style="max-width: 600px; margin-top: 20px;">
        </div>
      `;

      await this.mailService.sendMail(
        email,
        'BP Ventures - Restablecimiento de Contraseña',
        textContent, // Texto plano
        htmlContent, // Contenido HTML
      );

      return {
        message:
          '¡El enlace para restablecer la contraseña ha sido enviado a tu correo electrónico!',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    function decryptFromHex(encryptedHex: string, key: string) {
      let decryptedText = '';
      for (let i = 0; i < encryptedHex.length; i += 2) {
        const hexPair = encryptedHex.slice(i, i + 2);
        const charCode =
          parseInt(hexPair, 16) ^ key.charCodeAt((i / 2) % key.length);
        decryptedText += String.fromCharCode(charCode);
      }
      return decryptedText;
    }

    const decryptedMessage = decryptFromHex(token.toString(), 'secretkey');

    const user = await this.userRepository.findOne({
      where: { email: decryptedMessage },
    });

    if (!user) throw new BadRequestException('Invalid token');
    user.password = await hashPassword(newPassword);
    await this.userRepository.save(user);
  }

  validateMfa(token: string, secret: string): boolean {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
    });
  }

  async generateMfaSecret(email: string, userId: string) {
    const secret = speakeasy.generateSecret({
      name: `BP Ventures (${email})`,
      length: 20,
    });

    await this.userRepository.update(userId, {
      mfaSecret: secret.base32,
      mfaEnabled: true,
    });

    return secret;
  }

  async generateMfaQrCode(secret: speakeasy.GeneratedSecret) {
    const otpAuthUrl = secret.otpauth_url;
    return await qrcode.toDataURL(otpAuthUrl);
  }
}
